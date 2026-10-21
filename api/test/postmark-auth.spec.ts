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
    const headers = [ar(`${AUTHSERV}; spf=pass dkim=pass header.d=acme.test dmarc=pass header.from=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(true);
  });

  it('accepts a DKIM pass whose d= is aligned to the From domain', () => {
    const headers = [ar(`${AUTHSERV}; dkim=pass header.d=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(true);
  });

  it('rejects a sender-injected result bearing a different authserv-id', () => {
    const headers = [ar('evil.example; dmarc=pass header.from=acme.test')];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('rejects a DKIM pass for an unrelated (attacker) domain', () => {
    const headers = [ar(`${AUTHSERV}; dkim=pass header.d=attacker.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('rejects a pass verdict hidden inside a comment', () => {
    const headers = [ar(`${AUTHSERV}; dmarc=fail (dmarc=pass header.from=acme.test) header.from=acme.test`)];
    expect(isAuthenticatedSender(headers, 'staff@acme.test')).toBe(false);
  });

  it('uses the topmost trusted header, not a lower injected one', () => {
    const headers = [
      ar(`${AUTHSERV}; dmarc=fail header.from=acme.test`), // our MTA's real verdict (topmost)
      ar(`${AUTHSERV}; dmarc=pass header.from=acme.test`), // injected lower down
    ];
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
