/**
 * Contract between the sandbox runner and user-authored collection scripts.
 *
 * Scripts must export:
 *   export default async function collect(): Promise<CollectedItem[]>
 *   — OR —
 *   async function collect(): Promise<CollectedItem[]>
 *   (the runner wraps the script so that a top-level `collect` function is found)
 *
 * Available globals inside the sandbox:
 *   fetch(url, options?)  — proxied, max 5 requests per run, 5 MB response limit
 *   URL, URLSearchParams  — standard Web APIs
 */
export interface CollectedItem {
  title: string;        // required
  url: string;          // required
  summary?: string;
  thumbnailUrl?: string;
  publishedAt?: string; // ISO 8601
  /**
   * Script-evaluated criteria check result.
   * 'matched'     — metric extracted and satisfies the condition
   * 'not_matched' — metric extracted but does not satisfy the condition
   * 'invalid'     — metric could not be extracted from this item
   * Omit when there is no monitoring criteria.
   */
  criteriaResult?: 'matched' | 'not_matched' | 'invalid';
  /** Raw extracted metric value for display, e.g. "¥299" or "1,234 stars". */
  metricValue?: string;
}

export interface RunResult {
  success: boolean;
  items?: CollectedItem[];
  error?: string;
}
