/**
 * checkFeed tool — lightweight RSS/Atom feed validator.
 *
 * Checks (in order):
 *   1. HTTP status is 2xx
 *   2. Response body contains XML feed markers (<rss, <feed, <item, or <entry>)
 *   3. (Optional) Response body contains a keyword — if absent, entity ID is likely wrong
 *
 * Accepts `keywords` and `urls` as separate top-level arrays — keywords are common
 * across all feeds, while each feed has its own URL and optional templateUrl.
 *
 * Returns a minimal result object to minimise token usage.
 * Intentionally avoids returning to feed body (unlike webFetch).
 */

const TIMEOUT_MS = 10_000;
const MAX_READ_BYTES_NO_KW = 32 * 1024; // 32 KB  — enough to detect XML markers
const MAX_READ_BYTES_WITH_KW = 256 * 1024; // 256 KB — enough to find entity name in feed titles

export interface CheckFeedResult {
  valid: boolean;
  status: number;
  /** Present when `templateUrl` was supplied and URL path does not match the pattern. */
  templateMismatch?: boolean;
  /** Present when `keywords` was supplied. */
  keywordFound?: boolean;
  /** Guidance for LLM when a check fails. */
  hint?: string;
}

/**
 * Convert a rssRadar templateUrl (with :param placeholders) into a RegExp
 * that matches a concrete URL path.
 * e.g. "https://rsshub.app/bilibili/user/video/:uid" → /^\/bilibili\/user\/video\/[^/]+(\/.*)?$/
 */
function buildTemplatePattern(templateUrl: string): RegExp | null {
  try {
    const path = new URL(templateUrl).pathname;
    // Replace each :param segment with a non-empty path-segment matcher
    const pattern = path.replace(/:([^/]+)/g, '[^/]+');
    return new RegExp(`^${pattern}(/.*)?$`);
  } catch {
    return null;
  }
}

export async function checkFeed(
  urls: string[],
  keywords?: string[],
  templateUrls?: string[],
): Promise<CheckFeedResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const maxBytes = keywords?.length ? MAX_READ_BYTES_WITH_KW : MAX_READ_BYTES_NO_KW;

  try {
    const results: CheckFeedResult[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const templateUrl = templateUrls?.[i];

      // ── Check 1: template pattern (free, no network) ──────────────────────────
      if (templateUrl) {
        const pattern = buildTemplatePattern(templateUrl);
        if (pattern) {
          let urlPath: string;
          try {
            urlPath = new URL(url).pathname;
          } catch {
            results.push({
              valid: false,
              status: 0,
              templateMismatch: true,
              hint: `The URL "${url}" is not a valid URL. Please construct it from the templateUrl "${templateUrl}" by replacing :param placeholders with real values.`,
            });
            continue;
          }

          if (!pattern.test(urlPath)) {
            results.push({
              valid: false,
              status: 0,
              templateMismatch: true,
              hint: `URL path "${urlPath}" does not match templateUrl pattern "${new URL(templateUrl).pathname}". Make sure every :param placeholder is replaced with a real value and no extra segments are added.`,
            });
            continue;
          }
        }
      }

      // ── Check 2 & 3: HTTP + XML markers ───────────────────────────────────────
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SubscribeAnything/1.0)',
          Accept: 'application/rss+xml,application/atom+xml,text/xml,application/xml,*/*',
        },
      });

      if (res.status < 200 || res.status >= 300) {
        results.push({ valid: false, status: res.status });
        continue;
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
        results.push({ valid: false, status: res.status });
        continue;
      }

      // ── Check 4: keywords presence (any match passes) ──────────────────────
      if (keywords?.length) {
        const textLower = text.toLowerCase();
        const keywordFound = keywords.some((kw) => textLower.includes(kw.toLowerCase()));
        results.push({
          valid: keywordFound,
          status: res.status,
          keywordFound: keywordFound,
          hint: !keywordFound
            ? `Feed is reachable but does not contain any of [${keywords.map((k) => `"${k}"`).join(', ')}]. The entity ID in the URL is likely wrong — use webSearch to find the correct ID and update the URL.`
            : undefined,
        });
      } else {
        results.push({ valid: true, status: res.status });
      }
    }

    return results;
  } catch {
    return urls.map(() => ({ valid: false, status: 0 }));
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
      'Validate multiple RSS/Atom feed URLs in parallel. For each feed, performs up to three checks:\n' +
      '1. HTTP 2xx status\n' +
      '2. Response body contains XML feed markers (<rss, <feed, <item>, or <entry>)\n' +
      '3. (Optional) If keywords provided: Response body contains at least one of the keywords — catches mismatched entity IDs.\n\n' +
      'Pass all feeds in a single call to maximise parallelism. Much cheaper in tokens than webFetch.',
    parameters: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: {
            type: 'string',
            description: 'List of RSS/Atom feed URLs to validate',
          },
        },
        keywords: {
          type: 'array',
          items: {
            type: 'string',
            description:
              'Channel/author/entity names and aliases to search in feed body (case-insensitive). ' +
              'Valid if ANY keyword is found — pass all known aliases to avoid false negatives.',
          },
        },
        templateUrls: {
          type: 'array',
          items: {
            type: 'string',
            description:
              'Optional: List of rssRadar template URLs corresponding to each feed. ' +
              'Used to verify URL structure before any network request.',
          },
        },
      },
      required: ['urls'],
    },
  },
};
