/**
 * Dependency-free, allowlist HTML sanitizer for phishing-scenario / template
 * bodies (Security review R2/R3). Default-deny: unknown tags are unwrapped,
 * unknown attributes dropped, dangerous URL schemes rejected, and whole
 * script-bearing elements removed with their content. Runs at storage time so
 * nothing malicious is ever persisted, and again is cheap to call before render.
 *
 * This is deliberately conservative, not a full HTML5 parser. The scenario
 * bodies it guards are simple marketing-style email HTML, so a strict allowlist
 * is both safe and sufficient. The {{TRACKING_URL}} / {{EMPLOYEE_NAME}}
 * placeholders survive untouched.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'small',
  'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'img',
]);

// Per-tag attribute allowlist. Everything else (incl. every on* handler, style,
// srcset, formaction, …) is dropped.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
};

// Elements removed entirely, INCLUDING their contents.
const DROP_WITH_CONTENT = [
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template',
  'svg', 'math', 'link', 'meta', 'base', 'title', 'head', 'form', 'button',
  'input', 'textarea', 'select', 'option', 'audio', 'video', 'source',
];

function stripDangerousBlocks(html: string): string {
  let out = html;
  // Remove HTML comments (can hide conditional-comment script on old IE, and noise).
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of DROP_WITH_CONTENT) {
    // opening..closing (non-greedy), and any stray self-closing/open form of it
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
    out = out.replace(new RegExp(`</${tag}\\s*>`, 'gi'), '');
  }
  return out;
}

function safeUrl(raw: string): string | null {
  const v = raw.trim();
  // Preserve the platform placeholder verbatim.
  if (v === '{{TRACKING_URL}}') return v;
  // Decode entities that could hide a scheme, then test.
  const decoded = v.replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d))).replace(/\s+/g, '');
  if (/^(javascript|data|vbscript|file):/i.test(decoded)) return null;
  // Allow http(s), mailto, protocol-relative, root/relative, and anchors.
  if (/^(https?:\/\/|mailto:|\/|#|\{\{)/i.test(v)) return v;
  // A bare relative path with no scheme is fine; anything with a ":" before a "/" is a scheme — reject.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return null;
}

function sanitizeAttributes(tag: string, attrString: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return ''; // tag allowed but carries no permitted attributes
  const attrs: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString))) {
    const name = m[1].toLowerCase();
    if (!allowed.has(name)) continue;
    if (name.startsWith('on')) continue;
    let value = m[3] ?? m[4] ?? m[5] ?? '';
    if (name === 'href' || name === 'src') {
      const safe = safeUrl(value);
      if (safe === null) continue;
      value = safe;
    }
    value = value.replace(/"/g, '&quot;');
    attrs.push(`${name}="${value}"`);
  }
  if (tag === 'a') {
    // Neutralise reverse-tabnabbing on any target and enforce a safe rel.
    if (!attrs.some((a) => a.startsWith('rel='))) attrs.push('rel="noopener noreferrer nofollow"');
  }
  return attrs.length ? ' ' + attrs.join(' ') : '';
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  const stripped = stripDangerousBlocks(String(input));

  // Rewrite each tag; unwrap disallowed tags (keep their text content).
  return stripped.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_full, slash, rawName, attrString) => {
    const tag = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (slash === '/') return `</${tag}>`;
    const selfClose = /\/\s*$/.test(attrString) || tag === 'br' || tag === 'hr' || tag === 'img';
    const attrs = sanitizeAttributes(tag, attrString);
    return selfClose ? `<${tag}${attrs} />` : `<${tag}${attrs}>`;
  });
}
