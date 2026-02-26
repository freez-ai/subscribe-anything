/**
 * htmlStrip — reduces raw HTML to a compact structural skeleton for LLM analysis.
 *
 * Removes: <script>, <style>, <noscript>, <svg>, HTML comments, and most attributes.
 * Keeps:   tag structure, text content, href/src/class/id/alt/datetime attributes.
 *
 * Typical reduction: 300–500 KB raw → 30–80 KB stripped (5–10× fewer tokens).
 * Collection scripts are written against the ORIGINAL page, so preserving the
 * selector-relevant attributes (class, id, href, src) is sufficient.
 */

/** Attributes useful for understanding page structure and writing regex/CSS selectors. */
const KEEP_ATTRS = new Set([
  'href', 'src', 'class', 'id', 'alt', 'name', 'type',
  'value', 'content', 'rel', 'datetime', 'data-url', 'data-href',
]);

function stripAttrString(attrStr: string): string {
  const kept: string[] = [];
  // Matches: name="val", name='val', name=bare, or standalone name
  const re = /([a-zA-Z][a-zA-Z0-9-:]*)(?:\s*=\s*(?:"([^"]*?)"|'([^']*?)'|([^\s>]*)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    if (!KEEP_ATTRS.has(name)) continue;
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    if (!val) continue;
    // Truncate very long values (base64 data URIs, bloated class lists)
    kept.push(`${name}="${val.length > 120 ? val.slice(0, 120) + '…' : val}"`);
  }
  return kept.length ? ' ' + kept.join(' ') : '';
}

/** Strip an HTML string down to a compact structural skeleton. */
export function stripHtml(raw: string): string {
  let html = raw;

  // 1. Remove HTML comments (often contain large conditional blocks)
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Keep only <title> from <head> (meta tags, link preloads, etc. not needed)
  html = html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, (match) => {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(match);
    return t ? `<head><title>${t[1].trim()}</title></head>\n` : '';
  });

  // 3. Remove large content blocks that contribute nothing to structure analysis
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  html = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '<svg/>');
  html = html.replace(/<canvas\b[^>]*>[\s\S]*?<\/canvas>/gi, '<canvas/>');

  // 4. Strip attributes from all opening tags, keeping only the useful whitelist
  html = html.replace(/<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/g, (_, tag: string, attrs?: string) => {
    if (!attrs) return `<${tag}>`;
    return `<${tag}${stripAttrString(attrs)}>`;
  });

  // 5. Normalize whitespace (multiple blank lines → one, leading tab-spaces → one space)
  html = html
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/(\n\s*){3,}/g, '\n\n');

  return html.trim();
}

/** Returns true when the body looks like an HTML document (not JSON / plain-text). */
export function isHtmlContent(body: string): boolean {
  const t = body.trimStart().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html') || t.startsWith('<head');
}
