import { isAuthenticatedSender, type MailHeader } from '../src/modules/intake/postmark-auth';

/**
 * The inbound sender-authentication check must trust ONLY our own MTA's
 * Authentication-Results, require alignment to the From domain, and resist
 * sender-injected headers / comment tricks. These cases are the spoofs the
 * security review called out.
 */
const AUTHSERV = 'mx.postmark.test';
const ar = (value: string): MailHeader => ({ Name: 'Authentication-Results', Value: value });

describe('isAuthenticatedSender', () => {
  const prev = process.env.POSTMARK_AUTHSERV_ID;
  beforeAll(() => {
    process.env.POSTMARK_AUTHSERV_ID = AUTHSERV;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.POSTMARK_AUTHSERV_ID;
    else process.env.POSTMARK_AUTHSERV_ID = prev;
  });

  it('accepts a DMARC pass aligned to the From domain from our MTA', () => {
    const headers = [ar(`${AUTHSERV}; spf=pass; dkim=pass header.d=acme.test; dmarc=pass header.from=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(true);
  });

  it('does NOT trust a DKIM pass on its own — only an aligned DMARC pass', () => {
    const headers = [ar(`${AUTHSERV}; dkim=pass header.d=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('rejects a DMARC pass whose header.from is a different domain', () => {
    const headers = [ar(`${AUTHSERV}; dmarc=pass header.from=attacker.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('rejects a sender-injected result bearing a different authserv-id', () => {
    const headers = [ar('evil.example; dmarc=pass header.from=acme.test')];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('rejects a pass verdict hidden inside a (nested) comment', () => {
    const headers = [ar(`${AUTHSERV}; dmarc=fail (a(dmarc=pass header.from=acme.test)b) header.from=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('rejects a pass hidden in a quoted property value', () => {
    const headers = [ar(`${AUTHSERV}; dmarc=fail reason="dmarc=pass header.from=acme.test" header.from=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('rejects when two headers carry the trusted authserv-id (injection attempt)', () => {
    const headers = [
      ar(`${AUTHSERV}; dmarc=fail header.from=acme.test`), // our MTA's real verdict
      ar(`${AUTHSERV}; dmarc=pass header.from=acme.test`), // sender-injected duplicate
    ];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('does not let an escaped paren in a comment leak the verdict', () => {
    // The "\)" is escaped, so the comment runs to the real ")" and the hidden
    // dmarc=pass is dropped, leaving only dmarc=fail.
    const headers = [ar(`${AUTHSERV}; dmarc=fail (c\\)dmarc=pass header.from=acme.test) header.from=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('fails closed on a malformed header (unbalanced parentheses)', () => {
    const headers = [ar(`${AUTHSERV}; dmarc=pass header.from=acme.test (oops`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('counts a malformed-but-ours duplicate so it cannot slip past the single-header guard', () => {
    const headers = [
      ar(`${AUTHSERV}; dmarc=pass header.from=acme.test (unbalanced`), // malformed, our id
      ar(`${AUTHSERV}; dmarc=pass header.from=acme.test`), // well-formed pass
    ];
    // Two headers bear our authserv-id ⟹ injection ⟹ reject, even though one
    // of them does not parse.
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('fails closed when no trusted authserv-id is configured', () => {
    const saved = process.env.POSTMARK_AUTHSERV_ID;
    delete process.env.POSTMARK_AUTHSERV_ID;
    const headers = [ar(`${AUTHSERV}; dmarc=pass header.from=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
    process.env.POSTMARK_AUTHSERV_ID = saved;
  });
});
