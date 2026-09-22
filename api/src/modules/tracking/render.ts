/** Base URL of the dedicated tracking domain, kept off vlumetech.com.ng. */
export function trackingBaseUrl(): string {
  return (process.env.TRACKING_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitutes the per-recipient placeholders into a scenario body. Employee
 * names are escaped: a scenario author is trusted with HTML, an imported CSV
 * is not.
 */
export function renderScenario(
  bodyHtml: string,
  vars: { trackingUrl: string; pixelUrl: string; employeeName: string },
): string {
  const body = bodyHtml
    .split('{{TRACKING_URL}}')
    .join(vars.trackingUrl)
    .split('{{EMPLOYEE_NAME}}')
    .join(escapeHtml(vars.employeeName));

  const pixel = `<img src="${vars.pixelUrl}" width="1" height="1" alt="" style="display:none" />`;
  return body.includes('</body>') ? body.replace('</body>', `${pixel}</body>`) : `${body}${pixel}`;
}

/**
 * The page a client sees after opening the gateway delivery test.
 *
 * Plain HTML from the API rather than a redirect into the console: whoever
 * clicks is an employee reading their mail, not someone with a session, and
 * bouncing them to a login would lose the confirmation.
 */
export function renderAllowlistResult(tenantName: string | null): string {
  const ok = tenantName !== null;
  const heading = ok ? 'Delivery confirmed' : 'This link has already been used';
  const body = ok
    ? `Our test message reached this mailbox, so your mail gateway is letting Vlumeaware ` +
      `through. The allow-list check on ${escapeHtml(tenantName as string)} is now marked as ` +
      `confirmed, and campaigns can be launched.`
    : 'Each delivery test can be confirmed once. If you need to check again, send a new test ' +
      'from People → Domains in the Vlumeaware console.';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading} — Vlumeaware</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F1F5F4;
    font-family:ui-sans-serif,-apple-system,"Helvetica Neue",Arial,sans-serif;color:#0F1B16}
  .card{max-width:32rem;margin:1.5rem;padding:2rem;background:#fff;border:1px solid #DEE7E2;
    border-radius:16px;box-shadow:0 1px 3px rgba(15,27,22,.06)}
  h1{margin:0 0 .75rem;font-size:1.25rem;letter-spacing:-.02em}
  p{margin:0;font-size:.875rem;line-height:1.6;color:#3B4A43}
  .mark{display:block;margin-bottom:1.25rem}
  .brand{margin-top:1.5rem;font-size:.75rem;color:#93A29B}
</style></head><body>
<div class="card">
  <svg class="mark" width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M24 7a17 17 0 1 1-12.02 4.98" stroke="${ok ? '#0B7C57' : '#93A29B'}" stroke-width="6" stroke-linecap="round"/>
    <path d="M11 4.5 11.5 12.5 19.5 12" stroke="${ok ? '#0B7C57' : '#93A29B'}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="7" fill="#0F1B16"/>
  </svg>
  <h1>${heading}</h1>
  <p>${body}</p>
  <p class="brand">Vlumeaware</p>
</div></body></html>`;
}
