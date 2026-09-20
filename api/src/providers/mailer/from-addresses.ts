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
    'reports@vlumeaware-trk.io'
  );
}

/** False when the address above is only the built-in default. */
export function notificationFromIsConfigured(): boolean {
  return Boolean(process.env.NOTIFICATION_FROM_ADDRESS ?? process.env.DIGEST_FROM_ADDRESS);
}
