/**
 * generateScriptAgent — Wizard Step 4 (per source)
 *
 * For a single data source, the agent:
 * 1. Fetches the page with webFetch to inspect its structure
 * 2. Writes a JS collection script
 * 3. Validates it with validateScript (up to MAX_RETRIES attempts)
 * 4. Returns { script, cronExpression, initialItems } on success
 *
 * SSE events are NOT emitted here — the caller (generate-scripts route) emits
 * source_progress events based on this function's return value.
 */

import { getTemplate, getProviderForTemplate, buildOpenAIClient, llmStream } from '@/lib/ai/client';
import type { LLMCallInfo } from '@/lib/ai/client';
import { webFetch, webFetchToolDef } from '@/lib/ai/tools/webFetch';
import { webFetchBrowser, webFetchBrowserToolDef } from '@/lib/ai/tools/webFetchBrowser';
import { webSearch, webSearchToolDef } from '@/lib/ai/tools/webSearch';
import { validateScript, validateScriptToolDef } from '@/lib/ai/tools/validateScript';
import { rssRadar, rssRadarToolDef } from '@/lib/ai/tools/rssRadar';
import { validateScriptAgent } from './validateScriptAgent';
import type { CollectedItem } from '@/lib/sandbox/contract';
import type OpenAI from 'openai';

const MAX_RETRIES = 3;

export interface GenerateResult {
  success: boolean;
  sandboxUnavailable?: boolean;
  script?: string;
  cronExpression?: string;
  initialItems?: CollectedItem[];
  error?: string;
}

export interface SourceInput {
  title: string;
  url: string;
  description: string;
  criteria?: string;
  /** Optional user-supplied hint appended to the LLM user message (used on retry). */
  userPrompt?: string;
}

type Message = OpenAI.Chat.ChatCompletionMessageParam;

/** Generate a collection script for a single source. */
export async function generateScriptAgent(
  source: SourceInput,
  onProgress?: (message: string) => void,
  onLLMCall?: (info: LLMCallInfo) => void
): Promise<GenerateResult> {
  const provider = getProviderForTemplate('generate-script');
  const tpl = getTemplate('generate-script');

  let sourceDomain = '';
  try { sourceDomain = new URL(source.url).hostname; } catch { /* ignore */ }

  const systemContent = tpl.content
    .replace('{{title}}', source.title)
    .replace('{{url}}', source.url)
    .replace('{{domain}}', sourceDomain)
    .replace('{{description}}', source.description || '无描述')
    .replace('{{criteria}}', source.criteria?.trim() || '无');

  const criteriaHint = source.criteria?.trim()
    ? `\n监控条件：${source.criteria.trim()}`
    : '';

  const userPromptSuffix = source.userPrompt?.trim()
    ? `\n\n用户补充说明：\n${source.userPrompt.trim()}`
    : '';

  const messages: Message[] = [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: `请为以下数据源编写采集脚本：\n标题：${source.title}\nURL：${source.url}\n描述：${source.description || '无'}${criteriaHint}${userPromptSuffix}`,
    },
  ];

  const openai = buildOpenAIClient(provider);

  // Track validation attempts and last successful items
  let validateAttempts = 0;
  let lastValidItems: CollectedItem[] | undefined;
  let lastScript: string | undefined;
  let lastCronExpression = '0 */6 * * *';
  let sandboxUnavailable = false;
  let lastScriptAttempted: string | undefined;

  // Agentic loop — max 32 iterations total (fetch + multiple validate retries)
  for (let iteration = 0; iteration < 32; iteration++) {
    let textBuffer = '';
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

    const stream = llmStream(openai, {
      model: provider.modelId,
      messages,
      tools: [rssRadarToolDef, webSearchToolDef, webFetchToolDef, webFetchBrowserToolDef, validateScriptToolDef],
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
          if (!toolCallMap.has(idx)) {
            toolCallMap.set(idx, { id: '', name: '', args: '' });
          }
          const entry = toolCallMap.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }

    }

    const toolCalls = Array.from(toolCallMap.values());

    // Extract cronExpression from text if agent mentions one
    const cronMatch = textBuffer.match(/\b(\d+|\*|[*/\d,-]+)\s+(\d+|\*|[*/\d,-]+)\s+(\*|[*/\d,-]+)\s+(\*|[*/\d,-]+)\s+(\*|[*/\d,-]+)\b/);
    if (cronMatch) lastCronExpression = cronMatch[0];

    // Also look for explicit cron mention
    const cronLabelMatch = textBuffer.match(/cron[^:]*:\s*[`"']?([0-9*,/\- ]{9,25})[`"']?/i);
    if (cronLabelMatch) lastCronExpression = cronLabelMatch[1].trim();

    // No more tool calls → agent finished
    // Push final text to messages so lastAssistantMsg captures it for script extraction
    if (toolCalls.length === 0) {
      if (textBuffer) {
        messages.push({ role: 'assistant', content: textBuffer } as Message);
      }
      break;
    }

    // Append assistant turn
    messages.push({
      role: 'assistant',
      content: textBuffer || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.args },
      })),
    } as Message);

    // Execute each tool call
    for (const tc of toolCalls) {
      let resultContent = '';

      try {
        const args = JSON.parse(tc.args || '{}');

        if (tc.name === 'rssRadar') {
          const queries: string[] = args.queries ?? (args.query ? [args.query] : [source.url]);
          const results = await Promise.all(queries.map((q) => rssRadar(q)));
          const combined = results.map((routes, i) => ({ query: queries[i], routes }));
          resultContent = JSON.stringify(combined);
          const total = results.reduce((s, r) => s + r.length, 0);
          onProgress?.(`RSS 路由查询：找到 ${total} 条`);
        } else if (tc.name === 'webSearch') {
          const query = args.query ?? '';
          onProgress?.(`网络搜索：${query}`);
          const results = await webSearch(query);
          resultContent = JSON.stringify(results);
        } else if (tc.name === 'webFetch') {
          const fetchUrl = args.url ?? source.url;
          onProgress?.(`正在抓取页面: ${fetchUrl}`);
          const result = await webFetch(fetchUrl);
          const truncNote = result.truncated ? '\n[内容已截断到前 500KB]' : '';
          resultContent = JSON.stringify({
            ok: result.ok,
            status: result.status,
            body: result.body + truncNote,
          });
        } else if (tc.name === 'webFetchBrowser') {
          const fetchUrl = args.url ?? source.url;
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
          const scriptArg = args.script ?? '';
          lastScriptAttempted = scriptArg;
          onProgress?.(`验证脚本 (第 ${validateAttempts} 次)...`);
          const result = await validateScript(scriptArg);

          // Detect sandbox unavailable (e.g. isolated-vm not built on Node v23 Windows)
          if (result.error?.includes('isolated-vm native module')) {
            sandboxUnavailable = true;
            onProgress?.('沙箱在当前环境不可用（需要 Node v22 LTS），脚本将跳过验证');
            resultContent = JSON.stringify({
              success: false,
              error: '沙箱不可用，请直接输出最终完整脚本并结束，不要再调用 validateScript。',
            });
          } else if (!result.success) {
            // Layer 1 failure: sandbox execution error
            onProgress?.(`验证失败: ${(result.error ?? '').slice(0, 80)}`);
            resultContent = JSON.stringify({
              success: result.success,
              itemCount: result.itemCount ?? 0,
              items: result.items?.slice(0, 3),
              error: result.error,
            });
            if (validateAttempts >= MAX_RETRIES) {
              resultContent = JSON.stringify({
                ...JSON.parse(resultContent),
                note: `已尝试 ${MAX_RETRIES} 次验证，请返回当前最佳脚本并结束。`,
              });
            }
          } else if ((result.itemCount ?? 0) === 0) {
            // Layer 1 failure: sandbox ran fine but collected no data
            onProgress?.('脚本执行成功但未采集到任何数据');
            resultContent = JSON.stringify({
              success: false,
              itemCount: 0,
              error: '脚本成功执行但未采集到任何数据，请检查页面选择器或目标 URL 结构',
              ...(validateAttempts >= MAX_RETRIES
                ? { note: `已尝试 ${MAX_RETRIES} 次，请返回当前最佳脚本并结束。` }
                : {}),
            });
          } else {
            // Layer 1 passed: ≥1 items collected — run layers 2 & 3 (LLM quality + data check)
            onProgress?.(`沙箱验证通过（${result.itemCount} 条），正在进行 LLM 质量审查...`);
            const llmCheck = await validateScriptAgent(
              source,
              scriptArg,
              result.items ?? [],
              iteration + 1, // offset so LLM call indices don't overlap with current iteration
              onLLMCall
            );

            if (llmCheck.valid) {
              lastScript = scriptArg;
              lastValidItems = result.items;
              onProgress?.(`LLM 审查通过，采集到 ${result.itemCount ?? 0} 条内容`);
              resultContent = JSON.stringify({
                success: true,
                itemCount: result.itemCount ?? 0,
                items: result.items?.slice(0, 3),
              });
            } else {
              // Layers 2/3 failed
              onProgress?.(`LLM 审查失败: ${llmCheck.reason.slice(0, 80)}`);
              const feedback: Record<string, unknown> = {
                success: false,
                itemCount: result.itemCount ?? 0,
                sandboxPassed: true,
                error: `LLM 质量审查失败：${llmCheck.reason}`,
              };
              if (llmCheck.fixedScript) {
                feedback.suggestedScript = llmCheck.fixedScript;
                feedback.note =
                  '已提供修复脚本（suggestedScript 字段），请调用 validateScript 验证该脚本';
              }
              if (validateAttempts >= MAX_RETRIES) {
                feedback.note = `已尝试 ${MAX_RETRIES} 次，请返回当前最佳脚本并结束。`;
              }
              resultContent = JSON.stringify(feedback);
            }
          }
        } else {
          resultContent = JSON.stringify({ error: `未知工具：${tc.name}` });
        }
      } catch (err) {
        resultContent = JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        });
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultContent,
      } as Message);
    }
  }

  if (lastScript && lastValidItems !== undefined) {
    return {
      success: true,
      script: lastScript,
      cronExpression: lastCronExpression,
      initialItems: lastValidItems,
    };
  }

  // If no successful validation, try to extract a script from the conversation.
  // The LLM often outputs its "best attempt" as a final code block after being
  // told to stop retrying — run one last validation instead of failing immediately.
  const lastAssistantMsg = messages
    .filter((m) => m.role === 'assistant')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n');

  // Permissive regex: match any language tag (javascript, JavaScript, js, typescript, etc.)
  const scriptMatch = [...lastAssistantMsg.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];

  const finalScript = scriptMatch.at(-1)?.[1] ?? lastScriptAttempted;

  // Sandbox unavailable — return the best script the LLM produced (from final text output
  // if available, otherwise the last validateScript attempt) unverified.
  if (sandboxUnavailable) {
    if (finalScript) {
      return {
        success: false,
        sandboxUnavailable: true,
        script: finalScript,
        cronExpression: lastCronExpression,
        initialItems: [],
      };
    }
    return { success: false, error: '沙箱不可用且未能提取有效脚本' };
  }

  if (finalScript) {
    onProgress?.('对最终脚本进行验证...');
    try {
      const result = await validateScript(finalScript);

      if (result.error?.includes('isolated-vm native module')) {
        return {
          success: false,
          sandboxUnavailable: true,
          script: finalScript,
          cronExpression: lastCronExpression,
          initialItems: [],
        };
      }

      if (result.success && (result.itemCount ?? 0) > 0) {
        onProgress?.(`沙箱验证通过（${result.itemCount} 条），正在进行 LLM 质量审查...`);
        const llmCheck = await validateScriptAgent(
          source,
          finalScript,
          result.items ?? [],
          100, // high offset — avoids callIndex conflicts with the main loop
          onLLMCall
        );
        if (llmCheck.valid) {
          return {
            success: true,
            script: finalScript,
            cronExpression: lastCronExpression,
            initialItems: result.items,
          };
        }
        return {
          success: false,
          script: llmCheck.fixedScript ?? finalScript,
          error: `LLM 质量审查失败：${llmCheck.reason}`,
        };
      }

      // Script ran but collected no items (likely SPA / bot-blocking)
      if (result.success) {
        return {
          success: false,
          script: finalScript,
          error: '脚本运行正常但未能采集到数据，页面可能需要 JavaScript 渲染或阻止了自动化请求',
        };
      }

      // Real execution error (syntax / runtime)
      return {
        success: false,
        script: finalScript,
        error: result.error ?? '脚本已生成，但多次验证均未通过',
      };
    } catch {
      return {
        success: false,
        script: finalScript,
        error: '脚本已生成，但验证过程中发生意外错误',
      };
    }
  }

  return { success: false, error: '智能体未能生成有效脚本' };
}
