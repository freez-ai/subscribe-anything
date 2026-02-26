/**
 * checkFeed tool — lightweight RSS/Atom feed validator.
 *
 * Only checks:
 *   1. HTTP status is 2xx
 *   2. Response body contains XML feed markers (<rss, <feed, <item, or <entry)
 *
 * Returns a minimal { valid, status } object to minimise token usage.
 * Intentionally avoids returning the feed body (unlike webFetch).
 */

const TIMEOUT_MS = 10_000;
const MAX_READ_BYTES = 32 * 1024; // read only the first 32 KB — enough to detect XML markers

export interface CheckFeedResult {
  valid: boolean;
  status: number;
}

export async function checkFeed(url: string): Promise<CheckFeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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

    // Read only the first 32 KB to detect feed markers without consuming the full body
    const reader = res.body?.getReader();
    let received = 0;
    let text = '';
    if (reader) {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      while (received < MAX_READ_BYTES) {
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

    return { valid: isXmlFeed, status: res.status };
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
      'Returns { valid: true } only when HTTP status is 2xx AND the response contains XML feed markers. ' +
      'Use this instead of webFetch when you only need to verify feed availability (much cheaper in tokens).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The RSS/Atom feed URL to validate',
        },
      },
      required: ['url'],
    },
  },
};
