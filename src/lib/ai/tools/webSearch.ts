/**
 * webSearch tool — wraps Tavily or Serper based on DB search provider config.
 *
 * Returns an array of search result objects:
 *   { title: string; url: string; snippet: string }[]
 *
 * Throws a user-friendly error if:
 *   - No search provider is configured (provider = 'none')
 *   - The API call fails
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { searchProviderConfig } from '@/lib/db/schema';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 10,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  // Tavily returns { results: [{ title, url, content, ... }] }
  return (data.results ?? []).map((r: { title: string; url: string; content: string }) => ({
    title: r.title,
    url: r.url,
    snippet: (r.content ?? '').slice(0, 200),
  }));
}

async function searchSerper(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, num: 10 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serper search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  // Serper returns { organic: [{ title, link, snippet, ... }] }
  return (data.organic ?? []).map((r: { title: string; link: string; snippet: string }) => ({
    title: r.title,
    url: r.link,
    snippet: (r.snippet ?? '').slice(0, 200),
  }));
}

/** Runs a web search using the configured provider. Throws if not configured. */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const db = getDb();
  const config = db
    .select()
    .from(searchProviderConfig)
    .where(eq(searchProviderConfig.id, 'default'))
    .get();

  const provider = config?.provider ?? 'none';
  const apiKey = config?.apiKey ?? '';

  if (provider === 'none' || !apiKey) {
    throw new Error(
      'No search provider configured. Please go to Settings → 搜索供应商 and configure Tavily or Serper.'
    );
  }

  if (provider === 'tavily') return searchTavily(query, apiKey);
  if (provider === 'serper') return searchSerper(query, apiKey);

  throw new Error(`Unknown search provider: ${provider}`);
}

/** OpenAI tool definition for webSearch */
export const webSearchToolDef = {
  type: 'function' as const,
  function: {
    name: 'webSearch',
    description: 'Search the web for information. Use this to find data sources and websites.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
  },
};
