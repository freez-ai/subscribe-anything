/**
 * checkFeed tool — lightweight RSS/Atom feed validator.
 *
 * Checks (in order):
 *   1. Auto-detect templateUrl from rssRadar cache and verify URL path matches
 *      the pattern (no network, catches un-replaced :param placeholders)
 *   2. HTTP status is 2xx
 *   3. Response body contains XML feed markers (<rss, <feed, <item, or <entry>)
 *   4. (Optional) Response body contains a keyword — if absent, entity ID is likely wrong
 *
 * Accepts `keywords` and `urls` as top-level fields; templateUrl matching is
 * automatic — callers no longer need to pass templateUrls explicitly.
 *
 * Returns a minimal result object to minimise token usage.
 * Intentionally avoids returning the feed body (unlike webFetch).
 */

import { findMatchingTemplateUrl } from './rssRadar';

const TIMEOUT_MS = 10_000;
const MAX_READ_BYTES_NO_KW = 32 * 1024; // 32 KB  — enough to detect XML markers
const MAX_READ_BYTES_WITH_KW = 256 * 1024; // 256 KB — enough to find entity name in feed titles

export interface CheckFeedResult {
  valid: boolean;
  status: number;
  /** URL path does not match any known rssRadar template pattern. */
  templateMismatch?: boolean;
  /** Present when `keywords` was supplied. */
  keywordFound?: boolean;
  /** Error message extracted from an RSSHub error HTML page. */
  errorMessage?: string;
  /** Guidance for the LLM when a check fails. */
  hint?: string;
}

/**
 * Extract the error message from an RSSHub error HTML page.
 * Looks for the <code class="...details..."> element produced by RSSHub's error template.
 */
function extractRssHubError(html: string): string | undefined {
  const match = html.match(/<code[^>]+class="[^"]*\bdetails\b[^"]*"[^>]*>([\s\S]*?)<\/code>/i);
  if (!match) return undefined;
  return match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .trim();
}

export async function checkFeed(
  urls: string[],
  keywords?: string[],
): Promise<CheckFeedResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const maxBytes = keywords?.length ? MAX_READ_BYTES_WITH_KW : MAX_READ_BYTES_NO_KW;

  try {
    const results: CheckFeedResult[] = [];

    for (const url of urls) {
      // ── Check 1: template pattern (free, no network) ──────────────────────
      const matchedTemplate = findMatchingTemplateUrl(url);
      if (matchedTemplate !== null) {
        // A template was found in cache — verify the URL fully matches (i.e. no
        // remaining :param placeholders, correct segment count, etc.)
        let urlPath: string;
        try {
          urlPath = new URL(url).pathname;
        } catch {
          results.push({
            valid: false,
            status: 0,
            templateMismatch: true,
            hint: `"${url}" is not a valid URL. Reconstruct it from the templateUrl "${matchedTemplate}" by replacing all :param placeholders with real values.`,
          });
          continue;
        }

        // The matched template's pattern already validated the segment count, but
        // reject if the concrete path still contains a raw ":param" segment.
        if (urlPath.split('/').some((seg) => seg.startsWith(':'))) {
          results.push({
            valid: false,
            status: 0,
            templateMismatch: true,
            hint: `URL path "${urlPath}" still contains un-replaced :param placeholders. Fill every placeholder from "${matchedTemplate}" with a real value.`,
          });
          continue;
        }
      }
      // If matchedTemplate is null the cache is cold or the URL is not an RSSHub
      // route — skip the template check and proceed to network checks.

      // ── Check 2 & 3: HTTP + XML markers ────────────────────────────────────
      let res: Response;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SubscribeAnything/1.0)',
            Accept: 'application/rss+xml,application/atom+xml,text/xml,application/xml,*/*',
          },
        });
      } catch {
        results.push({ valid: false, status: 0 });
        continue;
      }

      if (res.status < 200 || res.status >= 300) {
        let errorMessage: string | undefined;
        try {
          const errorHtml = await res.text();
          errorMessage = extractRssHubError(errorHtml);
        } catch {
          // ignore — body unavailable
        }
        results.push({ valid: false, status: res.status, ...(errorMessage !== undefined && { errorMessage }) });
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
        const errorMessage = extractRssHubError(text);
        results.push({ valid: false, status: res.status, ...(errorMessage !== undefined && { errorMessage }) });
        continue;
      }

      // ── Check 4: keywords presence (any match passes) ──────────────────────
      if (keywords?.length) {
        const textLower = text.toLowerCase();
        const keywordFound = keywords.some((kw) => textLower.includes(kw.toLowerCase()));
        results.push({
          valid: keywordFound,
          status: res.status,
          keywordFound,
          hint: !keywordFound
            ? `Feed is reachable but does not contain any of [${keywords.map((k) => `"${k}"`).join(', ')}]. The entity ID in the URL is likely wrong — use webSearch to find the correct ID and update the URL.`
            : undefined,
        });
      } else {
        results.push({ valid: true, status: res.status });
      }
    }

    return results;
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
      'Validate multiple RSS/Atom feed URLs in parallel. Performs up to three checks per URL:\n' +
      '1. Auto-detect templateUrl from rssRadar cache and verify URL path structure ' +
      '(catches un-replaced :param placeholders without any network call)\n' +
      '2. HTTP 2xx + XML feed markers in response body\n' +
      '3. (Optional) If keywords provided: response body contains at least one keyword ' +
      '(catches wrong entity IDs)\n\n' +
      'No need to pass templateUrls — structure validation is automatic. ' +
      'Pass all feeds in a single call to maximise parallelism.',
    parameters: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of RSS/Atom feed URLs to validate (all :param placeholders must be filled in)',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Entity names and aliases to search in every feed body (case-insensitive, shared across all URLs). ' +
            'Pass at least one — valid if ANY keyword is found. Include all known aliases to avoid false negatives.',
        },
      },
      required: ['urls'],
    },
  },
};
