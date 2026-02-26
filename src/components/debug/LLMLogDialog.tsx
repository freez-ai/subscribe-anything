'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import type { LLMCallInfo } from '@/lib/ai/client';

interface LLMLogDialogProps {
  sourceTitle: string;
  calls: LLMCallInfo[];
  totalTokens: number;
  onClose: () => void;
}

const ROLE_COLOR: Record<string, string> = {
  system: 'text-purple-400',
  user:   'text-blue-400',
  tool:   'text-yellow-400',
};

const MAX_PREVIEW_CHARS = 300;

/** Renders text truncated to 3 lines / 300 chars, with a click-to-expand toggle. */
function TruncatableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  const lines = text.split('\n');
  const needsTruncation = lines.length > 3 || text.length > MAX_PREVIEW_CHARS;

  if (!needsTruncation) {
    return <span className="whitespace-pre-wrap break-all">{text}</span>;
  }

  // Cap preview by both line count AND character count
  const previewByLines = lines.slice(0, 3).join('\n');
  const preview =
    previewByLines.length > MAX_PREVIEW_CHARS
      ? previewByLines.slice(0, MAX_PREVIEW_CHARS)
      : previewByLines;

  return (
    <span className="block">
      <span className="whitespace-pre-wrap break-all">
        {expanded ? text : preview}
        {!expanded && <span className="text-muted-foreground/40">…</span>}
      </span>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-primary/50 hover:text-primary transition-colors"
      >
        {expanded ? (
          <><ChevronUp className="h-2.5 w-2.5" />收起</>
        ) : (
          <><ChevronDown className="h-2.5 w-2.5" />展开全部 ({lines.length} 行)</>
        )}
      </button>
    </span>
  );
}

/**
 * One LLM call rendered as an inline block.
 * `prevMessageCount` = number of messages in the PREVIOUS call's array.
 * We only render the delta (messages added since the last call).
 * [assistant] messages are omitted — their content is already shown in the
 * response section below (tool_calls / responseText).
 */
function CallBlock({ info, prevMessageCount }: { info: LLMCallInfo; prevMessageCount: number }) {
  const isStreaming = info.streaming === true;
  const hasResponse = info.toolCalls.length > 0 || !!info.responseText;

  // Delta messages excluding assistant (shown in the response section instead)
  const newMessages = info.messages
    .slice(prevMessageCount)
    .filter((m) => m.role !== 'assistant');

  return (
    <div className="py-4 border-b border-border/20 last:border-b-0">
      {/* ── Delta messages (system / user / tool results) ── */}
      {newMessages.length > 0 && (
        <div className="space-y-1.5 mb-2.5">
          {newMessages.map((msg, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span
                className={`flex-shrink-0 w-[4.5rem] text-[10px] leading-[1.6] ${
                  ROLE_COLOR[msg.role] ?? 'text-foreground'
                }`}
              >
                [{msg.role}]
              </span>
              <span className="text-foreground/70 text-[11px] leading-relaxed flex-1 min-w-0">
                <TruncatableText text={msg.content} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Response (tool calls + text) ── */}
      {(hasResponse || isStreaming) && (
        <div
          className={`space-y-1 ${newMessages.length > 0 ? 'border-t border-border/15 pt-2' : ''}`}
        >
          <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            响应
            {isStreaming && (
              <>
                <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary/80" />
                </span>
                <span className="text-primary/40 normal-case">生成中...</span>
              </>
            )}
          </p>
          {info.toolCalls.map((tc, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="flex-shrink-0 text-orange-400 text-[10px] leading-[1.6]">
                [tool_call]
              </span>
              <span className="text-foreground/70 text-[11px] leading-relaxed flex-1 min-w-0">
                <TruncatableText text={`${tc.name}(${tc.args})`} />
              </span>
            </div>
          ))}
          {(info.responseText || isStreaming) && (
            <div className="flex gap-2 items-start">
              <span className="flex-shrink-0 text-green-400 text-[10px] leading-[1.6]">[text]</span>
              <span className="text-foreground/70 text-[11px] leading-relaxed flex-1 min-w-0">
                {info.responseText ? (
                  <TruncatableText text={info.responseText} />
                ) : (
                  <span className="text-muted-foreground/40 italic">等待响应...</span>
                )}
                {isStreaming && (
                  <span className="inline-block w-[6px] h-[1em] bg-foreground/60 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LLMLogDialog({
  sourceTitle,
  calls,
  totalTokens,
  onClose,
}: LLMLogDialogProps) {
  const isAnyStreaming = calls.some((c) => c.streaming);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50">
      <div className="bg-background w-full md:max-w-3xl rounded-t-2xl md:rounded-xl shadow-xl flex flex-col h-[90vh] md:h-[80vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">LLM 调用日志</h2>
              {isAnyStreaming && (
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary/80" />
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {sourceTitle}
              {totalTokens > 0 && (
                <span className="text-muted-foreground/60">
                  {' '}· {totalTokens.toLocaleString()} tokens
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Sequential call list ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 font-mono text-xs">
          {calls.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              暂无调用记录
            </div>
          ) : (
            calls.map((call, idx) => (
              <CallBlock
                key={idx}
                info={call}
                prevMessageCount={calls[idx - 1]?.messages.length ?? 0}
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
