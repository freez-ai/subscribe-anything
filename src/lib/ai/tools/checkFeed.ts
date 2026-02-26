/**
 * checkFeed tool — lightweight RSS/Atom feed validator.
 *
 * Checks:
 *   1. HTTP status is 2xx
 *   2. Response body contains XML feed markers (<rss, <feed, <item, or <entry)
 *   3. (Optional) Response body contains a keyword — if not found, the entity
 *      ID embedded in the URL is likely wrong and the LLM should search again.
 *
 * Returns a minimal result object to minimise token usage.
 * Intentionally avoids returning the feed body (unlike webFetch).
 */

const TIMEOUT_MS = 10_000;
const MAX_READ_BYTES_NO_KW = 32 * 1024;   // 32 KB — enough to detect XML markers
const MAX_READ_BYTES_WITH_KW = 256 * 1024; // 256 KB — enough to find entity name in feed titles

export interface CheckFeedResult {
  valid: boolean;
  status: number;
  /** Only present when `keyword` was supplied. */
  keywordFound?: boolean;
  /** Guidance for the LLM when keyword is missing from an otherwise valid feed. */
  hint?: string;
}

export async function checkFeed(url: string, keyword?: string): Promise<CheckFeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const maxBytes = keyword ? MAX_READ_BYTES_WITH_KW : MAX_READ_BYTES_NO_KW;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SubscribeAnything/1.0)',
        Accept: 'application/rss+xml,application/atom+xml,text/xml,application/xml,*/*',
      },
    });

    if (res.status < 200 || res.status >= 300) {
      return { valid: false, status: res.status };
    }

    const reader = res.body?.getReader();
    let received = 0;
    let text = '';
    if (reader) {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      while (received < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        received += value.byteLength;
      }
      reader.cancel().catch(() => {});
    }

    const isXmlFeed =
      text.includes('<rss') ||
      text.includes('<feed') ||
      text.includes('<item>') ||
      text.includes('<item ') ||
      text.includes('<entry>') ||
      text.includes('<entry ');

    if (!isXmlFeed) {
      return { valid: false, status: res.status };
    }

    // Keyword check — case-insensitive, searches decoded text
    if (keyword) {
      const keywordFound = text.toLowerCase().includes(keyword.toLowerCase());
      if (!keywordFound) {
        return {
          valid: false,
          status: res.status,
          keywordFound: false,
          hint: `Feed is reachable but does not contain "${keyword}". The entity ID in the URL is likely wrong — use webSearch to find the correct ID and update the URL.`,
        };
      }
      return { valid: true, status: res.status, keywordFound: true };
    }

    return { valid: true, status: res.status };
  } catch {
    return { valid: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI tool definition for checkFeed */
export const checkFeedToolDef = {
  type: 'function' as const,
  function: {
    name: 'checkFeed',
    description:
      'Validate whether a URL is a live RSS/Atom feed. ' +
      'Returns { valid: true } only when HTTP status is 2xx AND the response body contains XML feed markers. ' +
      'Pass `keyword` (e.g. channel name, author, or topic) to also verify the feed content matches the intended entity — ' +
      'if the keyword is absent the entity ID in the URL is likely wrong and you should search for the correct one. ' +
      'Much cheaper in tokens than webFetch; use this whenever you only need to verify feed validity.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The RSS/Atom feed URL to validate',
        },
        keyword: {
          type: 'string',
          description:
            'Optional keyword to search for in the feed body (case-insensitive). ' +
            'Use the channel/author/entity name. If absent from a reachable feed, the URL entity ID is wrong.',
        },
      },
      required: ['url'],
    },
  },
};
