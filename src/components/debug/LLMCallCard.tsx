'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LLMCallInfo } from '@/lib/ai/client';

interface LLMCallCardProps {
  info: LLMCallInfo;
}

const ROLE_COLOR: Record<string, string> = {
  system: 'text-purple-500',
  user: 'text-blue-500',
  assistant: 'text-green-500',
  tool: 'text-yellow-500',
};

export default function LLMCallCard({ info }: LLMCallCardProps) {
  const [open, setOpen] = useState(false);

  const isStreaming = info.streaming === true;

  const summaryParts: string[] = [];
  if (isStreaming && info.toolCalls.length === 0 && !info.responseText) {
    summaryParts.push('→ 生成中...');
  } else if (info.toolCalls.length > 0) {
    summaryParts.push(`→ ${info.toolCalls.map((tc) => tc.name).join(', ')}`);
  } else if (info.responseText) {
    summaryParts.push('→ 文本回复');
  }
  if (info.usage) summaryParts.push(`${info.usage.total} tokens`);

  return (
    <div className="rounded border border-border/40 bg-muted/20 font-mono text-xs">
      {/* ── collapsed header ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          className={`h-3 w-3 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-semibold text-primary/80">LLM #{info.callIndex}</span>
        {/* Pulsing dot while streaming */}
        {isStreaming && (
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary/80" />
          </span>
        )}
        <span className="text-muted-foreground/70">{info.model}</span>
        {info.tools.length > 0 && (
          <span className="text-muted-foreground/50 hidden sm:inline">
            [{info.tools.join(', ')}]
          </span>
        )}
        {summaryParts.map((p, i) => (
          <span key={i} className="truncate text-muted-foreground/70">
            {p}
          </span>
        ))}
      </button>

      {/* ── expanded body ── */}
      {open && (
        <div className="border-t border-border/30 px-3 py-2 space-y-3 overflow-auto max-h-[60vh]">
          {/* Request */}
          <section>
            <p className="font-semibold text-muted-foreground mb-1">
              请求&nbsp;
              <span className="font-normal">
                ({info.messages.length} 条消息
                {info.tools.length > 0 && ` · 工具: ${info.tools.join(', ')}`})
              </span>
            </p>
            <div className="space-y-1">
              {info.messages.map((msg, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span
                    className={`flex-shrink-0 w-[4.5rem] ${ROLE_COLOR[msg.role] ?? 'text-foreground'}`}
                  >
                    [{msg.role}]
                  </span>
                  <span className="text-foreground/80 whitespace-pre-wrap break-all">
                    {msg.content}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Response */}
          <section>
            <p className="font-semibold text-muted-foreground mb-1">
              响应{isStreaming && <span className="ml-1.5 text-primary/60 font-normal">生成中...</span>}
            </p>
            {info.toolCalls.length === 0 && !info.responseText && !isStreaming && (
              <span className="text-muted-foreground/50 italic">（无内容）</span>
            )}
            {info.toolCalls.map((tc, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="flex-shrink-0 text-orange-500">[tool_call]</span>
                <span className="text-foreground/80 whitespace-pre-wrap break-all">
                  {tc.name}({tc.args})
                </span>
              </div>
            ))}
            {(info.responseText || isStreaming) && (
              <div className="flex gap-2 items-start">
                <span className="flex-shrink-0 text-green-500">[text]</span>
                <span className="text-foreground/80 whitespace-pre-wrap break-all">
                  {info.responseText}
                  {isStreaming && (
                    <span className="inline-block w-[7px] h-[1em] bg-foreground/70 ml-0.5 animate-pulse align-text-bottom" />
                  )}
                </span>
              </div>
            )}
            {info.usage && (
              <p className="mt-1 text-muted-foreground/50">
                prompt {info.usage.prompt} + completion {info.usage.completion} = {info.usage.total} tokens
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
