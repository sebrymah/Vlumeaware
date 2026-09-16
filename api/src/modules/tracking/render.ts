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
