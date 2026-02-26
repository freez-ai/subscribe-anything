/**
 * webFetchBrowser tool — server-side headless browser fetch for AI agents.
 *
 * Uses Playwright/Chromium to fully render a page and intercept JSON API
 * requests made during page load. Designed for SPA sites (React/Vue/Angular)
 * where plain fetch() only returns a skeleton HTML.
 *
 * The LLM uses the capturedRequests to discover the underlying data API and
 * writes a fetch-based collection script that works in the isolated-vm sandbox.
 *
 * HTML responses are stripped before returning to keep token usage low.
 * capturedRequests (JSON) are not stripped since they are already compact.
 *
 * Limits:
 *   - Max HTML returned (after strip): 100 KB
 *   - Max per-API-response: 50 KB
 *   - Max captured API requests: 10
 *   - Navigation timeout: 20 s; network-idle wait: 10 s
 *
 * NOTE: Requires `npx playwright install chromium` on first use.
 */

import { chromium } from 'playwright';
import { stripHtml } from '@/lib/utils/htmlStrip';

const MAX_HTML_BYTES  = 100 * 1024;   // 100 KB after stripping (≈ 25k tokens)
const MAX_API_BYTES  = 50  * 1024;   // 50 KB per captured response
const MAX_CAPTURED   = 10;
const NAV_TIMEOUT_MS = 20_000;
const IDLE_TIMEOUT_MS = 10_000;

// URL patterns to skip (analytics, tracking, CDN noise)
const SKIP_PATTERN = /google|analytics|gtm|hotjar|clarity|sentry|bugsnag|doubleclick|facebook|twitter|segment|mixpanel|newrelic|datadog/i;

export interface CapturedRequest {
  url: string;
  method: string;
  status: number;
  body: string; // JSON response body, may be truncated
}

export interface BrowserFetchResult {
  ok: boolean;
  status: number;
  html: string;
  capturedRequests: CapturedRequest[];
  truncatedHtml: boolean;
}

export async function webFetchBrowser(url: string): Promise<BrowserFetchResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const capturedRequests: CapturedRequest[] = [];

    // Intercept JSON API responses during page load
    page.on('response', async (response) => {
      if (capturedRequests.length >= MAX_CAPTURED) return;

      const respUrl = response.url();
      if (SKIP_PATTERN.test(respUrl)) return;

      const contentType = response.headers()['content-type'] ?? '';
      if (!contentType.includes('application/json') && !contentType.includes('text/json')) return;

      try {
        const body = await response.text();
        if (body.length < 10) return; // skip empty/tiny responses
        capturedRequests.push({
          url: respUrl,
          method: response.request().method(),
          status: response.status(),
          body: body.length > MAX_API_BYTES ? body.slice(0, MAX_API_BYTES) + '\n[已截断]' : body,
        });
      } catch {
        // response body already consumed or network error — ignore
      }
    });

    let navStatus = 200;
    try {
      const navResponse = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      });
      navStatus = navResponse?.status() ?? 200;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 0, html: msg, capturedRequests: [], truncatedHtml: false };
    }

    // 4xx / 5xx — skip rendering wait and content, return just the status
    if (navStatus >= 400) {
      return { ok: false, status: navStatus, html: `HTTP ${navStatus}`, capturedRequests: [], truncatedHtml: false };
    }

    // Wait for async API calls to finish (SPA data loading)
    try {
      await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS });
    } catch {
      // networkidle timeout is acceptable — page has data, just never fully idled
    }

    const rawHtml = await page.content();

    // Strip HTML to reduce token usage (scripts/styles/noisy attrs removed)
    const stripped = stripHtml(rawHtml);
    const truncatedHtml = stripped.length > MAX_HTML_BYTES;

    return {
      ok: navStatus >= 200 && navStatus < 400,
      status: navStatus,
      html: truncatedHtml ? stripped.slice(0, MAX_HTML_BYTES) + '\n[HTML 已截断]' : stripped,
      capturedRequests,
      truncatedHtml,
    };
  } finally {
    await browser.close();
  }
}

/** OpenAI tool definition for webFetchBrowser */
export const webFetchBrowserToolDef = {
  type: 'function' as const,
  function: {
    name: 'webFetchBrowser',
    description:
      '用无头浏览器（Chromium）渲染页面，专用于 React/Vue/Angular 等 SPA 应用。' +
      '相比 webFetch，它能返回 JS 执行后的完整 HTML，更重要的是会捕获页面加载时发起的 JSON API 请求（capturedRequests 字段），' +
      '便于发现数据来源并直接用 fetch 调用底层 API 编写采集脚本。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要渲染的页面 URL',
        },
      },
      required: ['url'],
    },
  },
};
