/**
 * validateScript tool — runs a collection script in the isolated-vm sandbox
 * and returns success/items/error.
 *
 * Used by generateScriptAgent and repairScriptAgent so the LLM can verify
 * its generated script actually works before declaring success.
 */

import { runScript } from '@/lib/sandbox/runner';
import type { CollectedItem } from '@/lib/sandbox/contract';

export interface ValidateResult {
  success: boolean;
  items?: CollectedItem[];
  itemCount?: number;
  error?: string;
}

export async function validateScript(script: string): Promise<ValidateResult> {
  const result = await runScript(script);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return {
    success: true,
    items: result.items,
    itemCount: result.items?.length ?? 0,
  };
}

/** OpenAI tool definition for validateScript */
export const validateScriptToolDef = {
  type: 'function' as const,
  function: {
    name: 'validateScript',
    description: 'Run a collection script in the sandbox and check if it works correctly. Returns success/error and the collected items.',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'The JavaScript collection script to validate. Must export an async function collect().',
        },
      },
      required: ['script'],
    },
  },
};
