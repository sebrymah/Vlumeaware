/**
 * The Vlumeaware-provided shared sending domains any client may use without
 * owning or verifying a domain of their own.
 *
 * These are already verified in the platform's email-provider account, so mail
 * sent from them passes authentication for every tenant — the send path uses
 * one shared provider key. The list is config-driven so it can grow (realistic
 * lookalikes we maintain) without a code change, and defaults to the domain of
 * SIMULATION_FROM_ADDRESS, which is the address the platform already sends
 * simulations from.
 *
 *   SHARED_SENDING_DOMAINS=vlumesec.com,secure-vlumesec.com
 */
export function sharedSendingDomains(): string[] {
  const configured = (process.env.SHARED_SENDING_DOMAINS ?? '')
    .split(',')
    .map((d) => normalizeDomain(d))
    .filter((d): d is string => Boolean(d));

  if (configured.length > 0) return dedupe(configured);

  // Fall back to the simulation From address's domain, so the shared method
  // works out of the box on any deployment that can already send simulations.
  const fromDomain = normalizeDomain((process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumesec.com').split('@').pop());
  return fromDomain ? [fromDomain] : [];
}

/** True when `domain` is one the platform offers as a shared sending domain. */
export function isSharedSendingDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  return d ? sharedSendingDomains().includes(d) : false;
}

function normalizeDomain(value: string | undefined): string | undefined {
  const cleaned = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  return cleaned ? cleaned : undefined;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
