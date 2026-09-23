/**
 * What a client's IT team needs in order to let our simulated phishing through
 * their mail gateway.
 *
 * These are deployment facts, not per-tenant ones: every client is sent to
 * from the same egress addresses, so they live in configuration rather than in
 * the database. They are surfaced to client admins read-only — a client can
 * see what to allow-list, but only Vlumetech records that their IT confirmed
 * it, because a self-attested gate is not a gate.
 *
 * Microsoft 365's Advanced Delivery policy for phishing simulations requires
 * the sending domain AND the sending IP, which is why both are published here
 * rather than the domain alone.
 */

/** IPv4/IPv6 address, optionally with a CIDR suffix. */
const IP_OR_CIDR =
  /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?|[0-9a-f:]+(?:\/\d{1,3})?)$/i;

function domainOf(address: string | undefined): string | null {
  const at = address?.lastIndexOf('@') ?? -1;
  return at > 0 ? (address as string).slice(at + 1).trim().toLowerCase() || null : null;
}

export interface AllowlistGuidance {
  /** Egress IPs to allow. Empty when the deployment has not published any. */
  ips: string[];
  /** Domain the simulated mail is sent from. */
  sendingDomain: string | null;
  /** Domain the click / open tracking links resolve to (simulation infra). */
  trackingDomain: string | null;
  /**
   * Domain of the training and teachable-moment pages (PUBLIC_WEB_URL). It is a
   * different host from the tracking domain, and it is the link inside genuine
   * awareness-training emails — so if it is not allow-listed those land in
   * spam even when the sending domain is allowed. Null when it is the same host
   * as the tracking domain, so the UI does not list a duplicate.
   */
  landingDomain: string | null;
  /**
   * False when nothing has been configured, so the UI can say "not published
   * yet" instead of rendering an empty list that looks like "nothing to do".
   */
  configured: boolean;
}

export function allowlistGuidance(tenantSendingDomain?: string | null): AllowlistGuidance {
  // Anything that is not a plausible address is dropped rather than shown to a
  // client: a typo in the env var would otherwise become an instruction their
  // IT team pastes into a firewall.
  const ips = (process.env.ALLOWLIST_IPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && IP_OR_CIDR.test(s));

  const sendingDomain =
    tenantSendingDomain?.trim() || domainOf(process.env.SIMULATION_FROM_ADDRESS) || null;

  const trackingDomain = hostnameOf(process.env.TRACKING_BASE_URL);
  const landingHost = hostnameOf(process.env.PUBLIC_WEB_URL);
  // Only surface the landing domain when it is genuinely a different host from
  // the tracking one — otherwise it is the same allow-list entry twice.
  const landingDomain = landingHost && landingHost !== trackingDomain ? landingHost : null;

  return {
    ips,
    sendingDomain,
    trackingDomain,
    landingDomain,
    configured: ips.length > 0 || sendingDomain !== null,
  };
}

function hostnameOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}
