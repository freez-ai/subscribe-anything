import { createHash } from 'crypto';

/**
 * SHA-256 hash of the input string, returned as a hex string.
 * Used for deduplication: hash(title + url) → contentHash on message_cards.
 */
export function hash(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
