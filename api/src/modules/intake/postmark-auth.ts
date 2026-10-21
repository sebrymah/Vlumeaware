/** A single parsed header from Postmark's inbound payload. */
export interface MailHeader {
  Name?: string;
  Value?: string;
}

interface Resinfo {
  method: string;
  result: string;
  props: Record<string, string>;
}

/**
 * Remove RFC 5322 CFWS comments — `(...)`, nestable — returning `null` if the
 * header is malformed (unbalanced parens or quotes) so the caller fails closed.
 * Inside a comment `\` escapes the next character and `"` is a literal (not a
 * quote); outside, `"` opens a quoted string. A real scan, not a regex, so a
 * verdict hidden in a comment or behind an escaped paren cannot leak through.
 */
function stripComments(input: string): string | null {
  let out = '';
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (inQuote) {
      if (c === '\\') {
        out += c + (input[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (c === '"') inQuote = false;
      out += c;
      continue;
    }
    if (depth > 0) {
      // Inside a comment: drop content; '\' escapes the next char; '"' is literal.
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      continue;
    }
    if (c === '\\') {
      out += c + (input[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      out += c;
      continue;
    }
    if (c === '(') {
      depth += 1;
      continue;
    }
    if (c === ')') return null; // unbalanced close
    out += c;
  }
  return depth === 0 && !inQuote ? out : null;
}

/** Split on a single-char separator that is outside any quoted string. */
function splitOutsideQuotes(input: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (inQuote) {
      if (c === '\\') {
        cur += c + (input[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (c === '"') inQuote = false;
      cur += c;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      cur += c;
      continue;
    }
    if (c === sep) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return t;
}

/** Parse an Authentication-Results value; null authserv marks it unusable. */
function parse(value: string): { authserv: string | null; results: Resinfo[] } {
  const cleaned = stripComments(value);
  if (cleaned === null) return { authserv: null, results: [] };
  const parts = splitOutsideQuotes(cleaned, ';')
    .map((p) => p.trim())
    .filter(Boolean);
  const authserv = parts.length ? parts[0].split(/\s+/)[0].toLowerCase() : null;
  const results: Resinfo[] = [];
  for (const part of parts.slice(1)) {
    const tokens = splitOutsideQuotes(part, ' ')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tokens.length) continue;
    const eq = tokens[0].indexOf('=');
    if (eq === -1) continue;
    const method = tokens[0].slice(0, eq).toLowerCase();
    const result = tokens[0].slice(eq + 1).toLowerCase();
    const props: Record<string, string> = {};
    for (const tok of tokens.slice(1)) {
      const pe = tok.indexOf('=');
      if (pe === -1) continue;
      props[tok.slice(0, pe).toLowerCase()] = unquote(tok.slice(pe + 1)).toLowerCase();
    }
    results.push({ method, result, props });
  }
  return { authserv, results };
}

/**
 * Whether an inbound forwarded message's sending address is authenticated,
 * decided only from the Authentication-Results header our own trusted MTA
 * stamped (`POSTMARK_AUTHSERV_ID`). Hardened per the security review:
 *
 *  - The value is tokenised (comments stripped with a real scanner, quoted
 *    strings respected), and the header is rejected outright if malformed.
 *    Verdicts and property values are compared EXACTLY, never by substring.
 *  - Only headers whose authserv-id equals ours count, and there must be exactly
 *    ONE — an MTA strips pre-existing results bearing its own id (RFC 8601 §5),
 *    so a second one is a sender-injected forgery and we fail closed.
 *  - We trust ONLY a DMARC pass whose `header.from` exactly equals the From
 *    domain. DMARC pass already means the From was authenticated AND aligned, so
 *    there is no separate (over-permissive) DKIM-alignment path to abuse.
 *
 * Fails closed in every uncertain case. Defence-in-depth only: crediting a
 * report independently requires the reporter to be the send's real recipient.
 */
export function isAuthenticatedSender(headers: MailHeader[] | undefined, fromEmail: string): boolean {
  const trusted = process.env.POSTMARK_AUTHSERV_ID?.trim().toLowerCase();
  if (!trusted) return false;

  const fromDomain = fromEmail.split('@').pop()?.trim().toLowerCase();
  if (!fromDomain) return false;

  const ours = (headers ?? []).filter(
    (h) => h.Name?.toLowerCase() === 'authentication-results' && parse(h.Value ?? '').authserv === trusted,
  );
  if (ours.length !== 1) return false;

  return parse(ours[0].Value ?? '').results.some(
    (r) => r.method === 'dmarc' && r.result === 'pass' && r.props['header.from'] === fromDomain,
  );
}
