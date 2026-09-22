/**
 * Single source of truth for which address genuine (non-simulation) mail to
 * employees is sent from — certificates today, anything else later.
 *
 * Deliberately never SIMULATION_FROM_ADDRESS: that domain and IP pool exist to
 * deliver fake phishing, so its sending reputation is intentionally battered
 * and real mail sent from it is the most likely thing to land in spam.
 */
export function notificationFromAddress(): string {
  return (
    process.env.NOTIFICATION_FROM_ADDRESS ??
    process.env.DIGEST_FROM_ADDRESS ??
    'notifications@vlumesec.com'
  );
}

/**
 * Where the weekly client digest comes from. Falls back to the notification
 * address because both are genuine mail and belong on the same verified
 * domain — never on the simulation domain, for the reason above.
 *
 * The default is a real address on a domain we own. The previous default,
 * reports@vlumeaware-trk.io, was a placeholder: Resend rejects sends from an
 * unverified domain, so with DIGEST_FROM_ADDRESS unset every digest failed.
 */
export function digestFromAddress(): string {
  return (
    process.env.DIGEST_FROM_ADDRESS ??
    process.env.NOTIFICATION_FROM_ADDRESS ??
    'reports@vlumesec.com'
  );
}

/** False when the address above is only the built-in default. */
export function notificationFromIsConfigured(): boolean {
  return Boolean(process.env.NOTIFICATION_FROM_ADDRESS ?? process.env.DIGEST_FROM_ADDRESS);
}
