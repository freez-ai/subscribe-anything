/**
 * rssRadar — searches the RSSHub radar rules index via the active RSS instance.
 *
 * Actual JSON structure (one domain entry example):
 * "bilibili.com": {
 *   "_name": "哔哩哔哩 bilibili",
 *   "space": [                          ← subdomain group (array of routes)
 *     { "title": "UP 主投稿", "docs": "...", "source": ["/:uid"], "target": "/bilibili/user/video/:uid" },
 *     ...
 *   ],
 *   "www": [...],
 *   "live": [...],
 * }
 *
 * Cache: in-memory, 6-hour TTL. Invalidated automatically when the active
 * RSS instance base URL changes.
 */

import { getActiveRssBaseUrl } from '@/lib/rss';

const RADAR_RULES_PATH = '/api/radar/rules';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface RadarRoute {
  domain: string;
  websiteName: string;
  /** Route title, e.g. "UP 主投稿" */
  routeName: string;
  /** RSSHub path template with :param placeholders, e.g. "/bilibili/user/video/:uid" */
  rsshubPath: string;
  /** Full URL with :param placeholders against the active RSS instance base */
  templateUrl: string;
}

// In-memory cache — invalidated when base URL changes
let cachedRules: Record<string, unknown> | null = null;
let cacheTimestamp = 0;
let cachedBaseUrl = '';

async function getRules(baseUrl: string): Promise<Record<string, unknown>> {
  if (cachedRules && cachedBaseUrl === baseUrl && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRules;
  }

  const rulesUrl = `${baseUrl}${RADAR_RULES_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(rulesUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SubscribeAnything/1.0; RSS radar lookup' },
    });
    if (!res.ok) throw new Error(`Failed to fetch radar rules: HTTP ${res.status}`);
    cachedRules = await res.json() as Record<string, unknown>;
    cacheTimestamp = Date.now();
    cachedBaseUrl = baseUrl;
    return cachedRules;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Given a concrete feed URL, find the first rssRadar templateUrl whose path
 * pattern matches the URL's path. Uses the in-memory cache — returns null if
 * the cache is cold or no template matches (so callers degrade gracefully).
 */
export function findMatchingTemplateUrl(url: string): string | null {
  if (!cachedRules) return null;
  let urlPath: string;
  try {
    urlPath = new URL(url).pathname;
  } catch {
    return null;
  }

  for (const domainData of Object.values(cachedRules)) {
    if (!domainData || typeof domainData !== 'object') continue;
    const data = domainData as Record<string, unknown>;
    for (const [subKey, subValue] of Object.entries(data)) {
      if (subKey === '_name' || !Array.isArray(subValue)) continue;
      for (const routeItem of subValue as unknown[]) {
        if (!routeItem || typeof routeItem !== 'object') continue;
        const route = routeItem as Record<string, unknown>;
        const target = String(route.target ?? '');
        if (!target || !target.includes(':')) continue;
        const pattern = target.replace(/:([^/]+)/g, '[^/]+');
        if (new RegExp(`^${pattern}([/?#].*)?$`).test(urlPath)) {
          return `${cachedBaseUrl}${target}`;
        }
      }
    }
  }
  return null;
}

/**
 * Search the radar rules for a given query.
 * Query can be a domain ("bilibili.com"), website name ("哔哩哔哩"), or keyword.
 * Returns up to 20 matching routes built against the active RSS instance.
 */
export async function rssRadar(query: string): Promise<RadarRoute[]> {
  const baseUrl = getActiveRssBaseUrl();
  const rules = await getRules(baseUrl);
  const q = query.toLowerCase().trim();
  const results: RadarRoute[] = [];

  for (const [domain, domainData] of Object.entries(rules)) {
    if (results.length >= 20) break;
    if (!domainData || typeof domainData !== 'object') continue;

    const data = domainData as Record<string, unknown>;
    const websiteName = String(data['_name'] ?? domain);

    const domainMatches =
      domain.toLowerCase().includes(q) ||
      websiteName.toLowerCase().includes(q);

    // All keys except "_name" are subdomain groups containing arrays of routes
    for (const [subKey, subValue] of Object.entries(data)) {
      if (results.length >= 20) break;
      if (subKey === '_name') continue;
      if (!Array.isArray(subValue)) continue;

      for (const routeItem of subValue as unknown[]) {
        if (results.length >= 20) break;
        if (!routeItem || typeof routeItem !== 'object') continue;

        const route = routeItem as Record<string, unknown>;
        const routeName = String(route.title ?? '');
        const target = String(route.target ?? '');

        if (!target) continue;

        const routeMatches =
          routeName.toLowerCase().includes(q) ||
          target.toLowerCase().includes(q);

        if (!domainMatches && !routeMatches) continue;

        results.push({
          domain,
          websiteName,
          routeName,
          rsshubPath: target,
          templateUrl: `${baseUrl}${target}`,
        });
      }
    }
  }

  return results;
}

/** OpenAI tool definition for rssRadar */
export const rssRadarToolDef = {
  type: 'function' as const,
  function: {
    name: 'rssRadar',
    description:
      'Search the RSSHub radar rules index to find available RSS feed routes for one or more websites. ' +
      'Pass all queries in a single call — they are executed in parallel. ' +
      'Returns route templates — each templateUrl has :param placeholders you must fill in. ' +
      'IMPORTANT: queries must be bare domain names only (e.g. "bilibili.com", "zhihu.com") — ' +
      'do NOT include paths, user IDs, or full URLs. Full URLs will not match any routes.',
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of bare domain names or website names only — no paths or IDs (e.g. ["bilibili.com", "zhihu.com", "微博"])',
        },
      },
      required: ['queries'],
    },
  },
};
