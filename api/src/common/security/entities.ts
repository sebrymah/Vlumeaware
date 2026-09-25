/**
 * HTML entity decoding for the URL-scheme checks in the HTML sanitizers.
 *
 * This lives in its own module because it is a shared safety primitive. The
 * scenario-body sanitizer and the landing-page sanitizer must agree on what a
 * URL is: `&#x6a;avascript:`, `java&Tab;script:` and `javascript&colon;` are the
 * same attack as `javascript:`, and a browser decodes all of them inside an
 * attribute value before it decides whether to run the URL.
 *
 * They did not agree. The landing-page sanitizer was hardened for entity-encoded
 * schemes (commit c00b7f6) while the scenario-body sanitizer kept a
 * decimal-only decoder, so `<a href="&#x6a;avascript:...">` still survived into
 * stored scenario bodies and phishing templates. One shared implementation is
 * the fix; `test/sanitizer-parity.spec.ts` is the guard that keeps them equal.
 */

/**
 * The named references that matter for a URL: a scheme separator and the
 * whitespace characters a browser strips *out of* a URL before parsing it, so
 * `java&Tab;script:` reaches the URL parser as `javascript:`.
 */
const NAMED_ENTITIES: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
  amp: '&',
};

function fromCodePoint(code: number): string {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/**
 * Decodes numeric (hex and decimal) and the named entities above.
 *
 * One pass, in browser order: numeric references first, then named. A single
 * pass is deliberate and matches how a browser tokenises an attribute value —
 * `&amp;#x6a;` becomes the literal text `&#x6a;`, not a scheme, so decoding it
 * twice would invent a vulnerability that does not exist and reject a
 * legitimate link.
 */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * The form a scheme check must run against: entities decoded, then every C0
 * control, space and DEL removed so a scheme cannot be split or hidden by them,
 * then lowercased.
 */
export function normalizeForSchemeCheck(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return decodeEntities(raw).replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();
}

/** True when a decoded value declares a scheme a browser would not treat as safe. */
export function hasDangerousScheme(decoded: string): boolean {
  const scheme = decoded.match(/^([a-z][a-z0-9+.-]*):/);
  return scheme ? !['http', 'https', 'mailto'].includes(scheme[1]) : false;
}
