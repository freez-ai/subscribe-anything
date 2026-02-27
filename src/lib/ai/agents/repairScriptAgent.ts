/**
 * repairScriptAgent — fixes a failed collection script.
 *
 * Given the broken script + lastError + source URL, the agent:
 * 1. Fetches the page to re-inspect structure (webFetch or webFetchBrowser for SPAs)
 * 2. Rewrites / patches the script
 * 3. Validates with validateScript (up to MAX_RETRIES)
 * 4. Returns { success, script?, reason? }
 *
 * Does NOT auto-apply the fix; the caller (API route + UI) confirm before PATCH.
 */

import { getTemplate, getProviderForTemplate, buildOpenAIClient, llmStream } from '@/lib/ai/client';
import type { LLMCallInfo } from '@/lib/ai/client';
import { webFetch, webFetchToolDef } from '@/lib/ai/tools/webFetch';
import { webFetchBrowser, webFetchBrowserToolDef } from '@/lib/ai/tools/webFetchBrowser';
import { validateScript, validateScriptToolDef } from '@/lib/ai/tools/validateScript';
import type OpenAI from 'openai';

const MAX_RETRIES = 3;

export interface RepairResult {
  success: boolean;
  script?: string;
  reason?: string;
}

export interface RepairInput {
  url: string;
  script: string;
  lastError: string;
}

type Message = OpenAI.Chat.ChatCompletionMessageParam;

export async function repairScriptAgent(
  input: RepairInput,
  onProgress?: (message: string) => void,
  onLLMCall?: (info: LLMCallInfo) => void
): Promise<RepairResult> {
  const provider = getProviderForTemplate('repair-script');
  const tpl = getTemplate('repair-script');

  if (!tpl) return { success: false, reason: '未找到修复脚本提示模板' };

  const systemContent = tpl.content
    .replace('{{url}}', input.url)
    .replace('{{lastError}}', input.lastError)
    .replace('{{script}}', input.script);

  const messages: Message[] = [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: `请修复以下采集脚本。\n\n目标 URL：${input.url}\n\n错误信息：\n${input.lastError}\n\n当前脚本：\n\`\`\`javascript\n${input.script}\n\`\`\``,
    },
  ];

  const openai = buildOpenAIClient(provider);
  let validateAttempts = 0;
  let lastGoodScript: string | undefined;

  for (let iteration = 0; iteration < 10; iteration++) {
    let textBuffer = '';
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

    const stream = llmStream(openai, {
      model: provider.modelId,
      messages,
      tools: [webFetchToolDef, webFetchBrowserToolDef, validateScriptToolDef],
      tool_choice: 'auto',
      stream: true,
      stream_options: { include_usage: true },
    }, { callIndex: iteration + 1, onCall: onLLMCall });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) textBuffer += delta.content;
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallMap.has(idx)) toolCallMap.set(idx, { id: '', name: '', args: '' });
          const entry = toolCallMap.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }

    const toolCalls = Array.from(toolCallMap.values());

    // No more tool calls — push final text and exit loop
    if (toolCalls.length === 0) {
      if (textBuffer) {
        messages.push({ role: 'assistant', content: textBuffer } as Message);
      }
      break;
    }

    messages.push({
      role: 'assistant',
      content: textBuffer || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.args },
      })),
    } as Message);

    for (const tc of toolCalls) {
      let resultContent = '';
      try {
        const args = JSON.parse(tc.args || '{}');

        if (tc.name === 'webFetch') {
          const fetchUrl = args.url ?? input.url;
          onProgress?.(`正在抓取页面: ${fetchUrl}`);
          const result = await webFetch(fetchUrl);
          resultContent = JSON.stringify({
            ok: result.ok,
            status: result.status,
            body: result.body + (result.truncated ? '\n[内容已截断]' : ''),
          });
        } else if (tc.name === 'webFetchBrowser') {
          const fetchUrl = args.url ?? input.url;
          onProgress?.(`正在用浏览器渲染页面: ${fetchUrl}`);
          const result = await webFetchBrowser(fetchUrl);
          resultContent = JSON.stringify({
            ok: result.ok,
            status: result.status,
            html: result.html,
            capturedRequests: result.capturedRequests,
            note: result.capturedRequests.length > 0
              ? `已捕获 ${result.capturedRequests.length} 个 JSON API 请求，建议优先分析 capturedRequests 中的端点和数据结构来编写采集脚本`
              : '未捕获到 JSON API 请求，请根据渲染后的 HTML 结构编写采集脚本',
          });
        } else if (tc.name === 'validateScript') {
          validateAttempts++;
          onProgress?.(`验证修复后的脚本 (第 ${validateAttempts} 次)...`);
          const result = await validateScript(args.script ?? '');

          if (result.success) {
            lastGoodScript = args.script;
            onProgress?.(`验证通过，采集到 ${result.itemCount ?? 0} 条内容`);
          } else {
            onProgress?.(`验证失败: ${(result.error ?? '').slice(0, 80)}`);
          }

          resultContent = JSON.stringify({
            success: result.success,
            itemCount: result.itemCount ?? 0,
            error: result.error,
            note: validateAttempts >= MAX_RETRIES
              ? `已尝试 ${MAX_RETRIES} 次，请给出最终脚本并结束。`
              : undefined,
          });
        } else {
          resultContent = JSON.stringify({ error: `未知工具：${tc.name}` });
        }
      } catch (err) {
        resultContent = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }

      messages.push({ role: 'tool', tool_call_id: tc.id, content: resultContent } as Message);
    }
  }

  if (lastGoodScript) {
    return { success: true, script: lastGoodScript };
  }

  // Extract the best script from the conversation — use permissive regex and take the last match
  const lastText = messages
    .filter((m) => m.role === 'assistant')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n');

  const scriptMatch = [...lastText.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  const finalScript = scriptMatch.at(-1)?.[1];
  if (finalScript) {
    return { success: false, script: finalScript, reason: '脚本已生成但验证失败，请手动检查' };
  }

  return { success: false, reason: '修复失败，未能生成有效脚本' };
}
