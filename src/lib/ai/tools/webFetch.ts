/**
 * webFetch tool — server-side HTTP fetch for use by AI agents.
 *
 * This is NOT the sandboxed fetch used inside scripts.
 * It runs in the Node.js process and is used by generateScript and repairScript
 * agents to inspect a target page's HTML structure before writing a script.
 *
 * HTML responses are stripped (scripts/styles/noisy-attrs removed) before being
 * returned to the LLM to keep token usage low. Typical reduction: 10×.
 *
 * Limits:
 *   - Max download: 500 KB (raw response body)
 *   - Max returned (after strip): 100 KB
 *   - Timeout: 15 s
 */

import { stripHtml, isHtmlContent } from '@/lib/utils/htmlStrip';

const MAX_DOWNLOAD_BYTES = 500 * 1024; // 500 KB — limits what we read from server
const MAX_RETURN_BYTES   = 100 * 1024; // 100 KB — limits what we send to LLM (≈ 25k tokens)
const TIMEOUT_MS = 15_000;

export interface FetchResult {
  ok: boolean;
  status: number;
  body: string; // plain text, may be truncated
  truncated: boolean;
}

export async function webFetch(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SubscribeAnything/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/json,*/*',
      },
    });

    // 4xx / 5xx — no point reading or stripping an error page
    if (res.status >= 400) {
      return { ok: false, status: res.status, body: `HTTP ${res.status}`, truncated: false };
    }

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const downloadTruncated = bytes.byteLength > MAX_DOWNLOAD_BYTES;
    const slice = downloadTruncated ? bytes.slice(0, MAX_DOWNLOAD_BYTES) : bytes;
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(slice);

    // Strip HTML to drastically reduce token usage; leave JSON/text as-is
    const processed = isHtmlContent(raw) ? stripHtml(raw) : raw;
    const returnTruncated = processed.length > MAX_RETURN_BYTES;
    const body = returnTruncated
      ? processed.slice(0, MAX_RETURN_BYTES) + '\n[内容已截断]'
      : processed;

    return {
      ok: res.ok,
      status: res.status,
      body,
      truncated: downloadTruncated || returnTruncated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: message, truncated: false };
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI tool definition for webFetch */
export const webFetchToolDef = {
  type: 'function' as const,
  function: {
    name: 'webFetch',
    description:
      'Fetch the content of a URL. Use this to inspect a page HTML structure before writing a collection script. ' +
      'HTML is pre-stripped (scripts/styles removed, only structural tags and href/class/id kept) for token efficiency.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
      },
      required: ['url'],
    },
  },
};
