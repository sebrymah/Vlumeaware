import { createHash, randomInt } from 'node:crypto';

/**
 * License keys are read off a screen, pasted into an email, and sometimes
 * typed by hand, so the alphabet excludes characters that are easy to confuse:
 * I, L, O, U, 0 and 1. Crockford base32 minus U.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const GROUPS = 4;
const GROUP_LEN = 5;

/**
 * 20 characters from a 30-symbol alphabet is about 98 bits of entropy, which
 * is far beyond guessing even without the rate limit on redemption.
 *
 * randomInt is used rather than randomBytes % length: the modulo of a byte by
 * 30 is biased toward the low end of the alphabet, and a biased key is a
 * smaller key.
 */
export function generateLicenseKey(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < GROUP_LEN; i += 1) group += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(group);
  }
  return `VLA-${groups.join('-')}`;
}

/**
 * Normalises what a human pasted: case, stray whitespace, and the hyphens,
 * which people drop or add. Lookup is on the normalised form so
 * "vla xxxxx xxxxx" and "VLA-XXXXX-XXXXX" are the same key.
 */
export function normaliseLicenseKey(input: string): string {
  const bare = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = bare.startsWith('VLA') ? bare.slice(3) : bare;
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += GROUP_LEN) groups.push(body.slice(i, i + GROUP_LEN));
  return `VLA-${groups.join('-')}`;
}

/** Stored instead of the key itself, so a leak of the table redeems nothing. */
export function hashLicenseKey(key: string): string {
  return createHash('sha256').update(normaliseLicenseKey(key)).digest('hex');
}

/** Last four characters, for telling issued keys apart in a list. */
export function licenseKeyHint(key: string): string {
  return key.slice(-4);
}
