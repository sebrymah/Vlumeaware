/** A single parsed header from Postmark's inbound payload. */
export interface MailHeader {
  Name?: string;
  Value?: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The authserv-id is the first field of an Authentication-Results value. */
function authservId(value: string): string {
  return value.split(';', 1)[0].trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

/**
 * Whether an inbound forwarded message's sending address is authenticated,
 * decided ONLY from the Authentication-Results header our own trusted MTA
 * stamped (identified by `POSTMARK_AUTHSERV_ID`). Hardened against the obvious
 * spoofs:
 *
 *  - A sender can put any `Authentication-Results` header in their message, so
 *    we consider only the header whose authserv-id matches ours, and the
 *    **topmost** such header — the one our MTA prepended. (RFC 8601 requires an
 *    MTA to strip pre-existing results bearing its own id; taking the topmost
 *    is belt-and-braces if it does not.)
 *  - CFWS comments `(...)` are stripped before matching, so a verdict hidden in
 *    a comment (`dmarc=fail (dmarc=pass ...)`) cannot be read as real.
 *  - A pass must be **aligned to the From domain**: DMARC's `header.from`, or
 *    DKIM's `header.d`. A valid DKIM signature for an unrelated attacker domain
 *    therefore does not authenticate a spoofed From.
 *
 * Fails closed: with no configured authserv-id, no matching header, or no
 * aligned pass, the sender is treated as unauthenticated.
 */
export function isAuthenticatedSender(headers: MailHeader[] | undefined, fromEmail: string): boolean {
  const trusted = process.env.POSTMARK_AUTHSERV_ID?.trim().toLowerCase();
  if (!trusted) return false;

  const fromDomain = fromEmail.split('@').pop()?.trim().toLowerCase();
  if (!fromDomain) return false;

  const header = (headers ?? []).find(
    (h) =>
      h.Name?.toLowerCase() === 'authentication-results' &&
      authservId(h.Value ?? '') === trusted,
  );
  if (!header?.Value) return false;

  // Drop CFWS comments before matching verdicts or alignment.
  const ar = header.Value.replace(/\([^()]*\)/g, ' ');
  const aligned = (prop: string) =>
    new RegExp(`${prop}\\s*=\\s*@?${escapeRegExp(fromDomain)}(?![\\w.-])`, 'i').test(ar);

  const dmarcPass = /\bdmarc\s*=\s*pass\b/i.test(ar) && aligned('header\\.from');
  const dkimPass = /\bdkim\s*=\s*pass\b/i.test(ar) && aligned('header\\.d');
  return dmarcPass || dkimPass;
}
