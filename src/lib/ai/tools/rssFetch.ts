/**
 * rssFetch — fetches and parses an RSS or Atom feed URL.
 *
 * - Automatically replaces rsshub.app → freezrss.zeabur.app
 * - Parses RSS 2.0 and Atom 1.0 feeds via lightweight regex (no DOM, no extra deps)
 * - Returns up to 10 recent items so the agent can judge feed quality quickly
 *
 * Usage by agent:
 *   1. Call rssRadar({ query }) to get candidate routes with exampleUrls
 *   2. Call rssFetch({ url: exampleUrl }) to validate the feed is live and has data
 *   3. Use the feedUrl (with freezrss.zeabur.app) as the final source URL
 */

import { getActiveRssBaseUrl } from '@/lib/rss';

const RSSHUB_DOMAIN_RE = /rsshub\.app/gi;

export interface FeedItem {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
}

export interface FeedResult {
  feedTitle: string;
  /** Normalized URL (rsshub.app replaced with freezrss.zeabur.app) */
  feedUrl: string;
  items: FeedItem[];
  itemCount: number;
}

/** Replace rsshub.app with the active RSS instance base URL anywhere in a URL string */
export function normalizeRssHubUrl(url: string, baseUrl: string): string {
  return url.replace(RSSHUB_DOMAIN_RE, baseUrl.replace(/^https?:\/\//, ''));
}

// ── XML helpers ────────────────────────────────────────────────────────────────

/** Extract text from first matching XML tag (handles CDATA and basic entities) */
function extractTag(xml: string, tag: string): string {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const plainMatch = xml.match(plainRe);
  if (plainMatch) {
    return plainMatch[1]
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
  }
  return '';
}

/** Strip HTML tags and collapse whitespace; truncate to maxLen chars */
function stripHtml(html: string, maxLen = 200): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

// ── Feed parsers ───────────────────────────────────────────────────────────────

function parseRss(xml: string): { feedTitle: string; items: FeedItem[] } {
  const feedTitle = extractTag(xml, 'title') || 'RSS Feed';

  const items: FeedItem[] = xml
    .split(/<item[\s>]/i)
    .slice(1)
    .slice(0, 10)
    .map((block) => {
      const end = block.indexOf('</item>');
      const itemXml = end >= 0 ? block.slice(0, end) : block;
      const title = extractTag(itemXml, 'title');
      const link = extractTag(itemXml, 'link') || extractTag(itemXml, 'guid');
      const description = extractTag(itemXml, 'description') || extractTag(itemXml, 'summary');
      const pubDate =
        extractTag(itemXml, 'pubDate') ||
        extractTag(itemXml, 'dc:date') ||
        extractTag(itemXml, 'published');
      let publishedAt: string | undefined;
      if (pubDate) {
        try { publishedAt = new Date(pubDate).toISOString(); } catch { /* skip */ }
      }
      return {
        title: title || '(no title)',
        url: link,
        summary: description ? stripHtml(description) : undefined,
        publishedAt,
      };
    })
    .filter((item) => item.url.startsWith('http'));

  return { feedTitle, items };
}

function parseAtom(xml: string): { feedTitle: string; items: FeedItem[] } {
  // Channel title appears before the first <entry>
  const beforeFirstEntry = xml.split(/<entry[\s>]/i)[0] ?? xml;
  const feedTitle = extractTag(beforeFirstEntry, 'title') || 'Atom Feed';

  const items: FeedItem[] = xml
    .split(/<entry[\s>]/i)
    .slice(1)
    .slice(0, 10)
    .map((block) => {
      const end = block.indexOf('</entry>');
      const entryXml = end >= 0 ? block.slice(0, end) : block;
      const title = extractTag(entryXml, 'title');
      // Prefer rel="alternate" link, fall back to first href, then <id>
      const altLink = entryXml.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/i);
      const anyLink = entryXml.match(/<link[^>]+href="([^"]+)"/i);
      const link = (altLink ?? anyLink)?.[1] ?? extractTag(entryXml, 'id');
      const summary = extractTag(entryXml, 'summary') || extractTag(entryXml, 'content');
      const published = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated');
      let publishedAt: string | undefined;
      if (published) {
        try { publishedAt = new Date(published).toISOString(); } catch { /* skip */ }
      }
      return {
        title: title || '(no title)',
        url: link,
        summary: summary ? stripHtml(summary) : undefined,
        publishedAt,
      };
    })
    .filter((item) => item.url.startsWith('http'));

  return { feedTitle, items };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch an RSS/Atom feed URL and return its items.
 * rsshub.app is automatically replaced with freezrss.zeabur.app.
 */
export async function rssFetch(url: string): Promise<FeedResult> {
  const baseUrl = getActiveRssBaseUrl();
  const feedUrl = normalizeRssHubUrl(url, baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let xml: string;
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SubscribeAnything/1.0; RSS feed validator',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    xml = await res.text();
  } finally {
    clearTimeout(timer);
  }

  let parsed: { feedTitle: string; items: FeedItem[] };
  if (/<feed[\s>]/i.test(xml) && xml.includes('<entry')) {
    parsed = parseAtom(xml);
  } else if ((/<rss[\s>]/i.test(xml) || xml.includes('<channel')) && xml.includes('<item')) {
    parsed = parseRss(xml);
  } else {
    throw new Error('Response is not a valid RSS 2.0 or Atom 1.0 feed');
  }

  return {
    feedTitle: parsed.feedTitle,
    feedUrl,
    items: parsed.items,
    itemCount: parsed.items.length,
  };
}

/** OpenAI tool definition for rssFetch */
export const rssFetchToolDef = {
  type: 'function' as const,
  function: {
    name: 'rssFetch',
    description:
      'Fetch and parse an RSS or Atom feed URL to confirm it is live and contains real content. ' +
      'rsshub.app URLs are automatically rewritten to freezrss.zeabur.app. ' +
      'Use this after rssRadar to validate a candidate feed URL before recommending it. ' +
      'Returns feed title and up to 10 recent items with titles, URLs, and summaries.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'The RSS or Atom feed URL to fetch.',
        },
      },
      required: ['url'],
    },
  },
};
