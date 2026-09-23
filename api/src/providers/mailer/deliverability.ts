import { resolveTxt } from 'node:dns/promises';

/**
 * Live email-authentication state of a sending domain, read from public DNS.
 *
 * Simulated phishing that is not authenticated is junked before its content is
 * ever judged, so whether SPF, DKIM and DMARC are actually published is the
 * first thing to check when mail lands in spam. This reads the records the way
 * a receiving mail server does, so the diagnostic reflects reality rather than
 * what we believe was configured.
 *
 * The selectors are provider-specific: the platform sends through Resend, whose
 * DKIM selector is `resend._domainkey` and whose SPF/Return-Path lives on the
 * `send.` subdomain. DMARC is standard at `_dmarc.`. The checks are best-effort
 * and never throw — a lookup failure reads as "not found", not as an error.
 */
export interface DomainAuth {
  domain: string;
  /** DKIM key published at the provider's selector. */
  dkim: boolean;
  /** An SPF record found on the Return-Path (send.) subdomain or the root. */
  spf: boolean;
  /** A DMARC policy published at _dmarc. */
  dmarc: boolean;
  /** The DMARC policy word (none/quarantine/reject), when present. */
  dmarcPolicy: string | null;
  /** All three present — the state that keeps mail out of spam on auth alone. */
  authenticated: boolean;
}

/** Resolves TXT records for a name, flattening the provider's chunking. */
async function txt(name: string, timeoutMs = 3000): Promise<string[]> {
  try {
    const records = await withTimeout(resolveTxt(name), timeoutMs);
    return records.map((chunks) => chunks.join(''));
  } catch {
    // NXDOMAIN, timeout, SERVFAIL — all mean "cannot see the record", which for
    // this diagnostic is a clean negative, not a failure to report.
    return [];
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('dns timeout')), ms)),
  ]);
}

export async function checkDomainAuth(domain: string): Promise<DomainAuth> {
  const [dmarcTxt, dkimTxt, sendSpf, rootSpf] = await Promise.all([
    txt(`_dmarc.${domain}`),
    txt(`resend._domainkey.${domain}`),
    txt(`send.${domain}`),
    txt(domain),
  ]);

  const dmarcRecord = dmarcTxt.find((r) => /^v=DMARC1/i.test(r.trim()));
  const dmarcPolicy = dmarcRecord ? (dmarcRecord.match(/\bp=([a-z]+)/i)?.[1]?.toLowerCase() ?? null) : null;

  const dkim = dkimTxt.some((r) => /(^|;)\s*(v=DKIM1|k=rsa|p=[A-Za-z0-9+/])/i.test(r));
  const spf = [...sendSpf, ...rootSpf].some((r) => /^v=spf1\b/i.test(r.trim()));
  const dmarc = Boolean(dmarcRecord);

  return { domain, dkim, spf, dmarc, dmarcPolicy, authenticated: dkim && spf && dmarc };
}

export async function checkDeliverability(domains: string[]): Promise<DomainAuth[]> {
  const unique = [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  return Promise.all(unique.map((d) => checkDomainAuth(d)));
}
