/**
 * Escapes text interpolated into an HTML email body.
 *
 * Employee names, module titles and tenant names all reach these templates
 * from user input, so anything with `<` in it would otherwise be markup in the
 * recipient's client. Shared rather than redefined per service: there were
 * three copies of this, and three places for one of them to be forgotten.
 *
 * Quotes are escaped too, since these values are sometimes interpolated into
 * attributes and the three-character version silently fails there.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
