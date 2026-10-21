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
 * Remove RFC 5322 CFWS comments — `(...)`, nestable — while respecting quoted
 * strings (a `(` inside `"..."` is literal). Done with a real scan rather than a
 * regex so a verdict hidden in a comment can never survive into the parse.
 */
function stripComments(input: string): string {
  let out = '';
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (inQuote) {
      if (c === '\\') {
        if (depth === 0) out += c + (input[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (c === '"') inQuote = false;
      if (depth === 0) out += c;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      if (depth === 0) out += c;
      continue;
    }
    if (c === '(') {
      depth += 1;
      continue;
    }
    if (c === ')') {
      if (depth > 0) depth -= 1;
      continue;
    }
    if (depth === 0) out += c;
  }
  return out;
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

/** Parse an Authentication-Results value into its authserv-id and resinfos. */
function parse(value: string): { authserv: string; results: Resinfo[] } {
  const parts = splitOutsideQuotes(stripComments(value), ';')
    .map((p) => p.trim())
    .filter(Boolean);
  const authserv = parts.length ? parts[0].split(/\s+/)[0].toLowerCase() : '';
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
 *  - The value is tokenised (comments stripped, quoted strings respected, split
 *    into resinfo entries); verdicts and property values are compared EXACTLY,
 *    never by a substring regex over the whole header. So a pass hidden in a
 *    comment, in a quoted string, or in an unrelated property cannot match.
 *  - Only headers whose authserv-id equals ours are considered, and there must
 *    be exactly ONE — an MTA strips pre-existing results bearing its own id
 *    (RFC 8601 §5), so a second one means a sender tried to inject theirs, and
 *    we fail closed.
 *  - A pass must be aligned to the From domain: DMARC `header.from` equal to it,
 *    or DKIM `header.d` equal to it (or a parent domain it is a subdomain of).
 *
 * Fails closed: no configured authserv-id, not exactly one trusted header, or no
 * aligned pass ⟹ unauthenticated. This is defence-in-depth; crediting a report
 * independently requires the reporter to be the send's real recipient.
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

  const alignsToFrom = (value: string | undefined): boolean => {
    if (!value) return false;
    const d = value.replace(/^@/, '');
    return d === fromDomain || fromDomain.endsWith(`.${d}`);
  };

  return parse(ours[0].Value ?? '').results.some(
    (r) =>
      (r.method === 'dmarc' && r.result === 'pass' && r.props['header.from'] === fromDomain) ||
      (r.method === 'dkim' && r.result === 'pass' && alignsToFrom(r.props['header.d'])),
  );
}
