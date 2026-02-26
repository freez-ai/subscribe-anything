/**
 * Static safety analysis run BEFORE the script enters the isolated-vm sandbox.
 * Blocks known dangerous patterns to provide defence-in-depth on top of isolated-vm.
 */

interface ForbiddenPattern {
  re: RegExp;
  reason: string;
}

const FORBIDDEN: ForbiddenPattern[] = [
  { re: /require\s*\(/,         reason: 'require() is not allowed' },
  { re: /\bimport\s+/,          reason: 'static import is not allowed' },
  { re: /process\s*\./,         reason: 'process object is not allowed' },
  { re: /\beval\s*\(/,          reason: 'eval() is not allowed' },
  { re: /new\s+Function\s*\(/,  reason: 'new Function() is not allowed' },
  { re: /\bchild_process\b/,    reason: 'child_process is not allowed' },
  { re: /(?<![.\w])exec\s*\(/,   reason: 'exec() is not allowed' },
  { re: /\bspawn\s*\(/,         reason: 'spawn() is not allowed' },
  { re: /\bsystem\s*\(/,        reason: 'system() is not allowed' },
  { re: /globalThis\s*\[/,      reason: 'globalThis property access via bracket notation is not allowed' },
  // Allow 'global' as a word but not 'global.' (property access)
  { re: /\bglobal\s*\./,        reason: 'global object property access is not allowed' },
];

export interface SafetyResult {
  safe: boolean;
  violation?: string;
}

export function checkSafety(script: string): SafetyResult {
  for (const { re, reason } of FORBIDDEN) {
    if (re.test(script)) {
      return { safe: false, violation: reason };
    }
  }
  return { safe: true };
}
