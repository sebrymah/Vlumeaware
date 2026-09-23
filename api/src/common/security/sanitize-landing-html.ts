/**
 * Allowlist sanitizer for CLIENT-AUTHORED landing pages (the simulated login a
 * target sees after clicking). More permissive than the scenario-body
 * sanitizer — it allows layout tags and CSS so a client can make the page look
 * like the portal their staff really use — but it keeps every hard safety
 * guarantee:
 *
 *   - No script ever runs: <script> and every on* handler are removed, and the
 *     /t/* pages serve a strict script-src (nonce, no unsafe-inline), so even a
 *     handler that slipped through could not execute.
 *   - No credential capture: <form>, <input>, <textarea>, <select>, <button>
 *     are removed with their contents. The ONLY functional form on the page is
 *     the platform's metadata-only form, injected at the {{LOGIN_FORM}} marker
 *     (or appended). A custom page therefore cannot post what a user types
 *     anywhere — it never has a field wired to submit.
 *   - No exfiltration primitives: <iframe>, <object>, <embed>, <link>, <meta>,
 *     <base>, <svg> are dropped; CSS is stripped of @import, expression(),
 *     behaviour bindings and javascript:/vbscript: URLs.
 *   - URLs are allow-listed after entity/whitespace decoding, so an encoded
 *     scheme (&#x6a;avascript:, java&Tab;script:) cannot slip a handler through.
 *
 * Appearance in, no behaviour. Runs at storage time and again before render.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup',
  'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'label',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'footer', 'section', 'main', 'nav', 'article', 'aside', 'figure', 'figcaption',
  'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'img', 'style',
]);

// style/class/id are allowed on every tag (styling), so they are handled
// globally; these are the extra per-tag attributes.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
};
const GLOBAL_ATTRS = new Set(['style', 'class', 'id']);

const DROP_WITH_CONTENT = [
  'script', 'iframe', 'object', 'embed', 'noscript', 'template',
  'svg', 'math', 'link', 'meta', 'base', 'head',
  'form', 'button', 'input', 'textarea', 'select', 'option', 'audio', 'video', 'source',
];

const LOGIN_FORM_MARKER = '{{LOGIN_FORM}}';

/** Removes CSS that could run script or reach out over the network. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]+;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/-?(moz|webkit|o|ms)?-?binding\s*:/gi, '')
    .replace(/behavior\s*:/gi, '')
    // url(javascript:…) / url(vbscript:…) / url(data:text/html…)
    .replace(/url\(\s*['"]?\s*(javascript|vbscript|data:text\/html)/gi, 'url(#blocked');
}

function stripDangerousBlocks(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of DROP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
    out = out.replace(new RegExp(`</${tag}\\s*>`, 'gi'), '');
  }
  return out;
}

/**
 * Decodes the HTML entity forms a scheme can hide behind — decimal (&#106;),
 * hex (&#x6a;) and the handful of named entities that matter for URLs — so the
 * scheme check below cannot be fooled by `&#x6a;avascript:`.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeFromCodePoint(Number(d)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n');
}

function safeFromCodePoint(code: number): string {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/**
 * URL allow-list (fail closed). After decoding entities and stripping control
 * characters and whitespace, a value that declares a scheme must be one we
 * permit — http(s), mailto, or an inline image data: URI. Anchors, root- and
 * bare-relative paths and the login-form marker are allowed; everything else,
 * including javascript:/vbscript:/file:/data:text-html, is rejected.
 */
function safeUrl(raw: string): string | null {
  const v = raw.trim();
  if (v === LOGIN_FORM_MARKER) return v;
  // Strip C0 controls (incl. tab/newline), space and DEL after decoding, so a
  // scheme cannot be split or hidden by them.
  // eslint-disable-next-line no-control-regex
  const decoded = decodeEntities(v).replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();

  if (decoded.startsWith('#') || decoded.startsWith('/') || decoded.startsWith('{{')) return v;

  const scheme = decoded.match(/^([a-z][a-z0-9+.-]*):/);
  if (scheme) {
    const s = scheme[1];
    if (s === 'http' || s === 'https' || s === 'mailto') return v;
    if (decoded.startsWith('data:image/')) return v;
    return null;
  }
  return v; // no scheme — a bare relative path/filename
}

/** HTML-encodes a value for safe placement inside a double-quoted attribute. */
function encodeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeAttributes(tag: string, attrString: string): string {
  const perTag = ALLOWED_ATTRS[tag];
  const attrs: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString))) {
    const name = m[1].toLowerCase();
    if (name.startsWith('on')) continue;
    const isGlobal = GLOBAL_ATTRS.has(name);
    if (!isGlobal && !(perTag && perTag.has(name))) continue;
    let value = m[3] ?? m[4] ?? m[5] ?? '';
    if (name === 'href' || name === 'src') {
      const safe = safeUrl(value);
      if (safe === null) continue;
      value = safe;
    }
    if (name === 'style') value = sanitizeCss(value);
    attrs.push(`${name}="${encodeAttr(value)}"`);
  }
  if (tag === 'a' && !attrs.some((a) => a.startsWith('rel='))) {
    attrs.push('rel="noopener noreferrer nofollow"');
  }
  return attrs.length ? ' ' + attrs.join(' ') : '';
}

export function sanitizeLandingHtml(input: string | null | undefined): string {
  if (!input) return '';
  let stripped = stripDangerousBlocks(String(input));

  // <style> is kept for visual fidelity, but its CSS is text (not an attribute),
  // so scrub the block body for @import / expression() / script URLs here. The
  // close is optional (…|$): an UNCLOSED <style> runs to end of input, and its
  // CSS must be scrubbed too — we force-close it so it cannot swallow the form.
  stripped = stripped.replace(
    /<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi,
    (_m, css) => `<style>${sanitizeCss(String(css))}</style>`,
  );

  return stripped.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_full, slash, rawName, attrString) => {
    const tag = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (slash === '/') return `</${tag}>`;
    const selfClose = /\/\s*$/.test(attrString) || tag === 'br' || tag === 'hr' || tag === 'img' || tag === 'col';
    const attrs = sanitizeAttributes(tag, attrString);
    return selfClose ? `<${tag}${attrs} />` : `<${tag}${attrs}>`;
  });
}

export { LOGIN_FORM_MARKER };
