/**
 * isolated-vm execution engine.
 *
 * Security model (layered):
 *  1. checkSafety() — static pattern analysis before entering the isolate
 *  2. isolated-vm Isolate — V8 native sandbox (same tech as Cloudflare Workers)
 *  3. Memory cap: 64 MB per Isolate
 *  4. Timeout: 30 s total
 *  5. Fetch proxy: max 5 HTTP requests, 5 MB response size limit
 *
 * NOTE: isolated-vm is a native Node.js addon.
 *   • Docker/Linux (node:23-bookworm-slim): works out of the box.
 *   • Windows local dev: requires Node v22 LTS for the native build.
 *     Install via nvm-windows, then `npm rebuild isolated-vm`.
 *   When isolated-vm is unavailable the runner returns a clear error instead
 *   of crashing the server.
 */

import type { CollectedItem, RunResult } from './contract';
import { checkSafety } from './safety';
import vm from 'vm';

const MEMORY_LIMIT_MB = 64;
const TIMEOUT_MS = 30_000;
const MAX_FETCH_REQUESTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Fix the JSON-transport regex escaping problem.
 *
 * When a script is transmitted as a JSON string value, JSON.parse converts
 * every `\/` → `/`.  If that `\/` was inside a JavaScript regex literal
 * (e.g. `/<\/a>/`) the resulting bare `/` terminates the regex early and
 * the following characters (e.g. `a>`) are misread as regex flags, causing
 * "Invalid regular expression flags" SyntaxError.
 *
 * This function scans the source, identifies `/` characters that appear
 * INSIDE an already-open regex literal (i.e. between the opening `/` and the
 * closing `/`), and replaces them with `[/]` (a character class that matches
 * a literal forward slash — semantically identical and safe in all regex engines).
 *
 * It also handles string literals, template literals, and comments so it does
 * not misidentify `/` in those contexts.
 */
function repairRegexSlashes(src: string): string {
  const out: string[] = [];
  let i = 0;
  const len = src.length;

  // Tokens that indicate the previous non-whitespace was a value (division context)
  // vs. a keyword/operator (regex context).
  const VALUE_ENDINGS = new Set([')', ']', '}', '++', '--']);
  // Track last meaningful token to distinguish regex `/` from division `/`
  let lastToken = '';

  while (i < len) {
    const ch = src[i];

    // ── Single-line comment ──────────────────────────────────────────────
    if (ch === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const slice = end < 0 ? src.slice(i) : src.slice(i, end);
      out.push(slice);
      i += slice.length;
      continue;
    }

    // ── Multi-line comment ───────────────────────────────────────────────
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const slice = end < 0 ? src.slice(i) : src.slice(i, end + 2);
      out.push(slice);
      i += slice.length;
      continue;
    }

    // ── String literal (single or double quoted) ─────────────────────────
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === quote) { j++; break; }
        j++;
      }
      out.push(src.slice(i, j));
      lastToken = ')'; // treat as a value
      i = j;
      continue;
    }

    // ── Template literal ─────────────────────────────────────────────────
    if (ch === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < len) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
        if (src[j] === '}' && depth > 0) { depth--; j++; continue; }
        if (src[j] === '`' && depth === 0) { j++; break; }
        j++;
      }
      out.push(src.slice(i, j));
      lastToken = ')';
      i = j;
      continue;
    }

    // ── Potential regex literal ───────────────────────────────────────────
    if (ch === '/') {
      // Determine if this `/` opens a regex or is a division operator.
      // Heuristic: it's a regex if the previous meaningful token is NOT a
      // value-producing token (identifier, number, `)`, `]`).
      const isRegex = !VALUE_ENDINGS.has(lastToken) &&
                      !/^[\w$\d]$/.test(lastToken.slice(-1));

      if (isRegex) {
        // Consume the regex literal, replacing any bare `/` inside it with `[/]`
        let j = i + 1;
        let inClass = false;
        const regexOut: string[] = ['/'];

        while (j < len) {
          const c = src[j];
          if (c === '\\') {
            regexOut.push(src[j], src[j + 1] ?? '');
            j += 2;
            continue;
          }
          if (c === '[') { inClass = true; regexOut.push(c); j++; continue; }
          if (c === ']') { inClass = false; regexOut.push(c); j++; continue; }
          if (c === '/' && !inClass) {
            // Closing delimiter — consume flags
            j++;
            regexOut.push('/');
            while (j < len && /[a-zA-Z]/.test(src[j])) {
              regexOut.push(src[j]);
              j++;
            }
            break;
          }
          // A bare `/` INSIDE the regex (not escaped, not in a char class)
          // This is the JSON-transport artifact — replace with `[/]`
          if (c === '/') {
            regexOut.push('[/]');
            j++;
            continue;
          }
          regexOut.push(c);
          j++;
        }

        out.push(regexOut.join(''));
        lastToken = ')'; // regex is a value
        i = j;
        continue;
      }
      // Division operator — emit as-is
      out.push(ch);
      lastToken = ch;
      i++;
      continue;
    }

    // ── Track last non-whitespace token for regex/division disambiguation ─
    if (/\S/.test(ch)) lastToken = ch;
    out.push(ch);
    i++;
  }

  return out.join('');
}

export async function runScript(script: string): Promise<RunResult> {
  // Layer 1: static safety check — never enters the isolate if this fails
  const safetyResult = checkSafety(script);
  if (!safetyResult.safe) {
    return { success: false, error: `[Safety] ${safetyResult.violation}` };
  }

  // Normalize ES module export syntax → plain declarations the sandbox can run
  let normalizedScript = script
    // export default async function collect() → async function collect()
    .replace(/^\s*export\s+default\s+(async\s+function|function)\s+/gm, '$1 ')
    // export default async function() → async function collect()  (anonymous)
    .replace(/^\s*export\s+default\s+(async\s+function|function)\s*\(/gm, '$1 collect(')
    // export async function foo() → async function foo()
    .replace(/^\s*export\s+(async\s+function|function|class)\s+/gm, '$1 ')
    // export const/let/var foo = → const/let/var foo =
    .replace(/^\s*export\s+(const|let|var)\s+/gm, '$1 ')
    // export { ... } — remove entirely (re-exports, not needed)
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');

  // Fix JSON-transport regex escaping issue:
  // When scripts are passed as JSON string values, JSON.parse converts `\/` → `/`.
  // Inside a regex literal this causes the pattern to terminate early and the
  // following characters to be mis-parsed as regex flags → SyntaxError.
  // We repair this by replacing bare `/` that appears mid-regex with `[/]`
  // (a character class containing a forward slash, semantically identical).
  //
  // Strategy: scan character-by-character, tracking whether we are inside a
  // regex literal, string literal, comment, or template literal, and replace
  // any `/` that is NOT a regex delimiter with `[/]`.
  normalizedScript = repairRegexSlashes(normalizedScript);
  // Layer 2: syntax pre-check via Node.js vm — catches invalid regex, bad syntax, etc.
  // This runs BEFORE isolated-vm and produces clear error messages the AI can act on.
  try {
    new vm.Script(normalizedScript);
  } catch (err) {
    if (err instanceof SyntaxError) {
      // Node.js vm.Script includes the offending source line in err.stack, e.g.:
      //   evalmachine.<anonymous>:42
      //   const x = /pattern/bad;
      //                         ^
      // Extract that context so the LLM knows exactly which line to fix.
      const stack = err.stack ?? '';
      const lineNumMatch = stack.match(/evalmachine\.<anonymous>:(\d+)\n(.*)\n/);
      let detail = err.message;
      if (lineNumMatch) {
        const lineNum = lineNumMatch[1];
        const lineContent = lineNumMatch[2].trim().slice(0, 150);
        detail = `${err.message} — line ${lineNum}: ${lineContent}`;
      }
      return { success: false, error: `[Syntax] ${detail}` };
    }
    return { success: false, error: `[Syntax] ${String(err)}` };
  }

  // Layer 3: load isolated-vm (fails gracefully on unbuilt Windows dev)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let ivm: typeof import('isolated-vm');
  try {
    ivm = require('isolated-vm');
  } catch {
    return {
      success: false,
      error:
        'isolated-vm native module is not available. ' +
        'On Windows, install Node v22 LTS and run `npm rebuild isolated-vm`. ' +
        'In Docker (bookworm-slim) this is pre-built.',
    };
  }

  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });
  const context = await isolate.createContext();
  const jail = context.global;

  try {
    // Expose fetch proxy to the isolate
    let fetchCount = 0;

    const hostFetch = new ivm.Reference(
      async (url: string, optsJson: string): Promise<string> => {
        if (fetchCount >= MAX_FETCH_REQUESTS) {
          throw new Error(`Fetch limit exceeded (max ${MAX_FETCH_REQUESTS})`);
        }
        fetchCount++;

        const opts: RequestInit = optsJson ? JSON.parse(optsJson) : {};
        // Strip body for safety on sandbox fetches
        const res = await fetch(url, {
          method: opts.method ?? 'GET',
          headers: opts.headers as HeadersInit | undefined,
        });

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > MAX_RESPONSE_BYTES) {
          throw new Error('Response body exceeds 5 MB limit');
        }
        const body = new TextDecoder().decode(buffer);

        return JSON.stringify({
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          body,
        });
      }
    );

    await jail.set('__hostFetch', hostFetch, { copy: true });

    // Inject URL parser — host-side URL constructor, called synchronously from the isolate
    const hostResolveURL = new ivm.Reference((urlStr: string, base: string | undefined): string => {
      const u = base != null ? new URL(urlStr, base) : new URL(urlStr);
      return JSON.stringify({
        href: u.href, origin: u.origin, protocol: u.protocol,
        host: u.host, hostname: u.hostname, port: u.port,
        pathname: u.pathname, search: u.search, hash: u.hash,
        username: u.username, password: u.password,
      });
    });
    await jail.set('__hostResolveURL', hostResolveURL, { copy: true });

    // Bootstrap APIs inside the isolate
    await context.eval(`
      globalThis.fetch = async function(url, opts) {
        const json = await __hostFetch.apply(
          undefined,
          [String(url), JSON.stringify(opts ?? {})],
          { arguments: { copy: true }, result: { copy: true, promise: true } }
        );
        const d = JSON.parse(json);
        return {
          ok: d.ok,
          status: d.status,
          statusText: d.statusText,
          text:  () => Promise.resolve(d.body),
          json:  () => Promise.resolve(JSON.parse(d.body)),
        };
      };

      globalThis.URLSearchParams = class URLSearchParams {
        constructor(init) {
          this._p = [];
          if (!init) return;
          if (typeof init === 'string') {
            const s = init.startsWith('?') ? init.slice(1) : init;
            if (s) for (const pair of s.split('&')) {
              const eq = pair.indexOf('=');
              this._p.push(eq < 0
                ? [decodeURIComponent(pair), '']
                : [decodeURIComponent(pair.slice(0, eq)), decodeURIComponent(pair.slice(eq + 1))]);
            }
          } else if (Array.isArray(init)) {
            for (const [k, v] of init) this._p.push([String(k), String(v)]);
          } else if (typeof init === 'object') {
            for (const [k, v] of Object.entries(init)) this._p.push([String(k), String(v)]);
          }
        }
        get(k) { const f = this._p.find(([x]) => x === k); return f ? f[1] : null; }
        getAll(k) { return this._p.filter(([x]) => x === k).map(([,v]) => v); }
        has(k) { return this._p.some(([x]) => x === k); }
        append(k, v) { this._p.push([String(k), String(v)]); }
        delete(k) { this._p = this._p.filter(([x]) => x !== k); }
        set(k, v) {
          const i = this._p.findIndex(([x]) => x === k);
          if (i >= 0) { this._p[i][1] = String(v); this._p = this._p.filter(([x], j) => x !== k || j === i); }
          else this._p.push([String(k), String(v)]);
        }
        toString() { return this._p.map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&'); }
        forEach(fn) { this._p.forEach(([k,v]) => fn(v, k, this)); }
        keys() { return this._p.map(([k]) => k)[Symbol.iterator](); }
        values() { return this._p.map(([,v]) => v)[Symbol.iterator](); }
        entries() { return this._p[Symbol.iterator](); }
        [Symbol.iterator]() { return this._p[Symbol.iterator](); }
      };

      globalThis.URL = class URL {
        constructor(url, base) {
          let json;
          try {
            json = __hostResolveURL.applySync(
              undefined,
              [String(url), base != null ? String(base) : undefined],
              { arguments: { copy: true }, result: { copy: true } }
            );
          } catch(e) { throw new TypeError('Invalid URL: ' + url); }
          const d = JSON.parse(json);
          this.href = d.href; this.origin = d.origin; this.protocol = d.protocol;
          this.host = d.host; this.hostname = d.hostname; this.port = d.port;
          this.pathname = d.pathname; this.search = d.search; this.hash = d.hash;
          this.username = d.username; this.password = d.password;
          this.searchParams = new URLSearchParams(d.search ? d.search.slice(1) : '');
        }
        toString() { return this.href; }
        toJSON() { return this.href; }
        static canParse(url, base) {
          try { new globalThis.URL(url, base); return true; } catch { return false; }
        }
      };
    `);

    // Compile and run the user script, then call collect()
    const userScript = await isolate.compileScript(`
      ${normalizedScript}

      // Normalise: support both "export default async function collect" and plain function
      if (typeof module !== 'undefined' && module.exports && typeof module.exports.default === 'function') {
        globalThis.__collect = module.exports.default;
      } else if (typeof collect === 'function') {
        globalThis.__collect = collect;
      } else {
        throw new Error('Script must define an async function named collect()');
      }
    `);
    await userScript.run(context, { timeout: TIMEOUT_MS });

    // Execute collect() and retrieve the result as a JSON string
    const resultJson = await context.eval(
      `(async () => JSON.stringify(await __collect()))()`,
      { timeout: TIMEOUT_MS, promise: true }
    );

    // isolated-vm v6 returns the value directly; older versions return a Reference
    const raw = typeof resultJson === 'string'
      ? resultJson
      : await (resultJson as unknown as { copy(): Promise<string> }).copy();
    const items = JSON.parse(raw) as CollectedItem[];

    if (!Array.isArray(items)) {
      return { success: false, error: 'collect() must return an array' };
    }

    // Validate required fields on each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (typeof item.title !== 'string' || !item.title.trim()) {
        return { success: false, error: `Item[${i}] missing required field: title` };
      }
      if (typeof item.url !== 'string' || !item.url.trim()) {
        return { success: false, error: `Item[${i}] missing required field: url` };
      }
    }

    return { success: true, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    context.release();
    isolate.dispose();
  }
}
