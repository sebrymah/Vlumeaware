import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { EmailDomainsProvider, ProviderDomain, DnsRecord } from './email-domains.interface';

/**
 * Resend Domains API. Uses the same RESEND_API_KEY as outbound mail.
 *
 * When no key is set the provider is "unconfigured": every call fails loudly
 * rather than pretending to register a domain, so a misconfigured deploy
 * cannot leave a client believing a domain is being verified when nothing was
 * ever sent to Resend.
 */
@Injectable()
export class ResendDomainsProvider implements EmailDomainsProvider {
  private readonly logger = new Logger(ResendDomainsProvider.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  /** Resend requires a region on create; default matches the app's region. */
  private readonly region = process.env.RESEND_REGION ?? 'eu-west-1';

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Custom sending domains are not available on this deployment: RESEND_API_KEY is not set.',
      );
    }
  }

  private async call(path: string, init: RequestInit): Promise<any> {
    this.assertConfigured();
    const res = await fetch(`https://api.resend.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (body as { message?: string }).message ?? `HTTP ${res.status}`;
      this.logger.error(`Resend Domains ${init.method} ${path} failed: ${message}`);
      throw new BadGatewayException(`Email provider rejected the request: ${message}`);
    }
    return body;
  }

  private normalise(raw: any): ProviderDomain {
    const records: DnsRecord[] = Array.isArray(raw.records)
      ? raw.records.map((r: any) => ({
          record: r.record ?? r.type ?? 'DNS',
          name: r.name,
          type: r.type,
          value: r.value,
          ttl: r.ttl,
          priority: r.priority,
        }))
      : [];
    return { id: raw.id, name: raw.name, status: raw.status ?? 'pending', records };
  }

  async create(domain: string): Promise<ProviderDomain> {
    return this.normalise(
      await this.call('/domains', { method: 'POST', body: JSON.stringify({ name: domain, region: this.region }) }),
    );
  }

  async get(providerId: string): Promise<ProviderDomain> {
    return this.normalise(await this.call(`/domains/${providerId}`, { method: 'GET' }));
  }

  async verify(providerId: string): Promise<ProviderDomain> {
    // POST /verify triggers a re-check but returns a thin body; read the full
    // record straight after so the caller always gets records + status.
    await this.call(`/domains/${providerId}/verify`, { method: 'POST' });
    return this.get(providerId);
  }

  async remove(providerId: string): Promise<void> {
    await this.call(`/domains/${providerId}`, { method: 'DELETE' });
  }
}
