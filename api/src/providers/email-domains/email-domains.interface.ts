/**
 * The subset of the email provider's Domains API the platform needs, behind an
 * interface so the sending-domains service can be tested without real Resend
 * calls and so the provider can be swapped later.
 */
export const EMAIL_DOMAINS = Symbol('EMAIL_DOMAINS');

export interface DnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
}

export interface ProviderDomain {
  id: string;
  name: string;
  /** Provider status. "verified" is the only one that lets a domain send. */
  status: string;
  records: DnsRecord[];
}

export interface EmailDomainsProvider {
  /** True when a real provider is configured; false disables the feature cleanly. */
  readonly configured: boolean;
  create(domain: string): Promise<ProviderDomain>;
  get(providerId: string): Promise<ProviderDomain>;
  /** Ask the provider to re-check DNS now. Returns the fresh state. */
  verify(providerId: string): Promise<ProviderDomain>;
  remove(providerId: string): Promise<void>;
}
