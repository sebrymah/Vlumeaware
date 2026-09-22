/**
 * The published version of the authorization agreement shown at /terms.
 *
 * Must match AGREEMENT_VERSION in the API (src/common/config/agreement.ts).
 * Every acceptance is stored against that string, so changing the wording on
 * /terms without bumping both would retroactively alter what past clients
 * agreed to.
 */
export const AGREEMENT_VERSION = '2026-09-22';
