import { sanitizeHtml } from '../src/common/security/sanitize-html';
import { sanitizeLandingHtml } from '../src/common/security/sanitize-landing-html';

/**
 * The two HTML sanitizers guard different things — scenario/template bodies
 * rendered in the console and in email, and client-authored landing pages
 * rendered on the public simulated-login route — but they answer the same
 * question about a URL. They did not agree: commit c00b7f6 hardened the
 * landing-page decoder for entity-encoded schemes and left the scenario-body
 * decoder decimal-only, so `<a href="&#x6a;avascript:...">` survived into
 * stored phishing templates and executed on click in an authenticated console
 * that keeps 'unsafe-inline' and holds its bearer token in localStorage.
 *
 * This spec is the guard against that recurring: one corpus, both sanitizers,
 * and an oracle written independently of the code under test.
 */

/**
 * A browser decodes an attribute value EXACTLY ONCE, numeric references first
 * then named. Modelling a second decode would report a vulnerability that does
 * not exist — `&amp;#x6a;` is the literal text "&#x6a;", not a scheme — so the
 * single pass is the whole point of writing this oracle separately.
 */
const NAMED: Record<string, string> = { colon: ':', tab: '\t', newline: '\n', sol: '/', amp: '&' };

function browserDecodeOnce(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED[name.toLowerCase()] ?? match);
}

const DANGEROUS_SCHEME = /^(javascript|vbscript|file|data|blob):/i;

/** Every href/src the sanitizer emitted, as the browser would resolve it. */
function emittedUrls(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/gi)) {
    urls.push(
      browserDecodeOnce(match[1]).replace(
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u0020\u007f]+/g,
        '',
      ),
    );
  }
  return urls;
}

/** Payloads that must never survive either sanitizer. */
const OBFUSCATED = [
  'javascript:alert(1)',
  '&#106;avascript:alert(1)',
  '&#x6a;avascript:alert(1)',
  '&#X6A;avascript:alert(1)',
  '&#x00006a;avascript:alert(1)',
  '&#106avascript:alert(1)',
  'java&Tab;script:alert(1)',
  'java&tab;script:alert(1)',
  'javascript&colon;alert(1)',
  'javascript&#x3a;alert(1)',
  'jav&#x09;ascript:alert(1)',
  'jav&#09;ascript:alert(1)',
  '\u0001javascript:alert(1)',
  '  javascript:alert(1)  ',
  'vbscript:msgbox(1)',
  '&#118;bscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  '&#x64;ata:text/html,x',
  'file:///etc/passwd',
];

/** Links that must survive both sanitizers untouched. */
const LEGITIMATE = [
  'https://acme.example/login',
  'http://acme.example',
  'mailto:it@acme.example',
  '/relative/path',
  '#anchor',
  'acme/page',
];

const SANITIZERS: Array<[string, (html: string) => string]> = [
  ['scenario-body', sanitizeHtml],
  ['landing-page', sanitizeLandingHtml],
];

describe('R2/R3 · sanitizer parity', () => {
  describe.each(SANITIZERS)('%s sanitizer', (_name, sanitize) => {
    it.each(OBFUSCATED)('blocks the dangerous scheme in %s', (payload) => {
      for (const tag of [`<a href="${payload}">x</a>`, `<img src="${payload}">`]) {
        for (const url of emittedUrls(sanitize(tag))) {
          expect(url).not.toMatch(DANGEROUS_SCHEME);
        }
      }
    });

    it.each(LEGITIMATE)('preserves %s', (href) => {
      expect(sanitize(`<a href="${href}">x</a>`)).toContain(`href="${href}"`);
    });
  });

  it('keeps the placeholder each sanitizer is responsible for', () => {
    // The scenario body must keep its tracking placeholder so mail still links.
    expect(sanitizeHtml('<a href="{{TRACKING_URL}}">x</a>')).toContain('href="{{TRACKING_URL}}"');
    // The landing page must keep the form marker, or the platform's
    // metadata-only form would never be injected.
    expect(sanitizeLandingHtml('<div>{{LOGIN_FORM}}</div>')).toContain('{{LOGIN_FORM}}');
  });
});
