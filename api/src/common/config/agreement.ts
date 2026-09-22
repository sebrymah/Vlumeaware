/**
 * The published authorization agreement a client accepts at signup.
 *
 * The version string is stored against every acceptance, so an acceptance can
 * always be tied back to the exact wording that was on screen. Publish new
 * terms by bumping this and updating the page it names — never by editing the
 * page alone, which would silently rewrite what past clients agreed to.
 *
 * Dated rather than numbered so the record reads plainly in an audit.
 */
export const AGREEMENT_VERSION = '2026-09-22';

/** Where the wording lives, for the acceptance record and the signup link. */
export const AGREEMENT_PATH = '/terms';
