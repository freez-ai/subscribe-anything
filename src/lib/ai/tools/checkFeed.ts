/**
 * checkFeed tool — lightweight RSS/Atom feed validator.
 *
 * Checks (in order):
 *   1. (Optional) URL path matches a rssRadar templateUrl pattern — free, no network
 *   2. HTTP status is 2xx
 *   3. Response body contains XML feed markers (<rss, <feed, <item, or <entry)
 *   4. (Optional) Response body contains a keyword — if absent, entity ID is likely wrong
 *
 * Returns a minimal result object to minimise token usage.
 * Intentionally avoids returning the feed body (unlike webFetch).
 */

const TIMEOUT_MS = 10_000;
const MAX_READ_BYTES_NO_KW  = 32  * 1024; // 32 KB  — enough to detect XML markers
const MAX_READ_BYTES_WITH_KW = 256 * 1024; // 256 KB — enough to find entity name in feed titles

export interface CheckFeedResult {
  valid: boolean;
  status: number;
  /** Present when `templateUrl` was supplied and the URL path does not match the pattern. */
  templateMismatch?: boolean;
  /** Present when `keyword` was supplied. */
  keywordFound?: boolean;
  /** Guidance for the LLM when a check fails. */
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
  url: string,
  keyword?: string,
  templateUrl?: string,
): Promise<CheckFeedResult> {
  // ── Check 1: template pattern (free, no network) ──────────────────────────
  if (templateUrl) {
    const pattern = buildTemplatePattern(templateUrl);
    if (pattern) {
      let urlPath: string;
      try {
        urlPath = new URL(url).pathname;
      } catch {
        return {
          valid: false,
          status: 0,
          templateMismatch: true,
          hint: `The URL "${url}" is not a valid URL. Please construct it from the templateUrl "${templateUrl}" by replacing :param placeholders with real values.`,
        };
      }

      if (!pattern.test(urlPath)) {
        return {
          valid: false,
          status: 0,
          templateMismatch: true,
          hint: `URL path "${urlPath}" does not match templateUrl pattern "${new URL(templateUrl).pathname}". Make sure every :param placeholder is replaced with a real value and no extra segments are added.`,
        };
      }
    }
  }

  // ── Check 2 & 3: HTTP + XML markers ───────────────────────────────────────
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

    // ── Check 4: keyword presence ──────────────────────────────────────────
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
      'Validate whether a URL is a live RSS/Atom feed. Performs up to three checks:\n' +
      '1. (If templateUrl given) URL path matches the rssRadar template pattern — catches wrong :param substitutions before any network call.\n' +
      '2. HTTP 2xx + XML feed markers in the response body.\n' +
      '3. (If keyword given) Response body contains the keyword — catches mismatched entity IDs (e.g. wrong user ID giving a different channel\'s feed).\n' +
      'Much cheaper in tokens than webFetch; use this to verify every RSS URL before finalising.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The concrete RSS/Atom feed URL to validate (all :param placeholders already filled in)',
        },
        templateUrl: {
          type: 'string',
          description:
            'The rssRadar templateUrl this URL was built from (e.g. "https://rsshub.app/bilibili/user/video/:uid"). ' +
            'Used to verify the URL structure is correct before making a network request.',
        },
        keyword: {
          type: 'string',
          description:
            'Optional keyword to search for in the feed body (case-insensitive). ' +
            'Use the channel/author/entity name. If absent from a reachable feed, the entity ID in the URL is likely wrong.',
        },
      },
      required: ['url'],
    },
  },
};
