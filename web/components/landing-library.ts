/**
 * Ready-made landing-page designs ("preloaded pages"). Each is plain HTML with
 * the {{LOGIN_FORM}} marker, so selecting one flows through the app's existing
 * custom-page path: it is sanitized server-side and rendered on the live
 * simulated-login page exactly like a client-authored page. No new table, no
 * change to the login render — which is why this scales to many designs as pure
 * content. The sanitizer drops <svg> and blocks external images, so brand marks
 * here are CSS/text (recognizable, not pixel-identical).
 */
export interface LandingLibraryItem {
  id: string;
  name: string;
  html: string;
}

const FONT = 'Segoe UI,Roboto,Helvetica,Arial,sans-serif';

function page(opts: {
  bg: string;
  logo: string;
  heading: string;
  sub?: string;
  note?: string;
  cardStyle?: string;
}): string {
  const card =
    opts.cardStyle ??
    'width:100%;max-width:420px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:40px 36px;box-shadow:0 2px 12px rgba(0,0,0,.08)';
  return `<div style="min-height:560px;display:flex;align-items:center;justify-content:center;background:${opts.bg};padding:48px 16px;font-family:${FONT}">
  <div style="${card}">
    <div style="text-align:center">${opts.logo}</div>
    <h1 style="margin:20px 0 4px;font-size:22px;font-weight:600;color:#1f2937;text-align:center">${opts.heading}</h1>
    ${opts.sub ? `<p style="margin:0 0 6px;font-size:14px;color:#6b7280;text-align:center">${opts.sub}</p>` : ''}
    {{LOGIN_FORM}}
    ${opts.note ? `<p style="margin-top:18px;font-size:12px;color:#9ca3af;text-align:center">${opts.note}</p>` : ''}
  </div>
</div>`;
}

/** A small coloured wordmark/badge, drawn in CSS (no SVG, no external assets). */
const badge = (text: string, bg: string, color = '#fff') =>
  `<span style="display:inline-block;background:${bg};color:${color};font-weight:700;font-size:18px;line-height:1;padding:10px 12px;border-radius:8px">${text}</span>`;

export const LANDING_LIBRARY: LandingLibraryItem[] = [
  {
    id: 'zoho',
    name: 'Zoho Mail — sign in',
    html: page({
      bg: '#f4f5f7',
      logo: `<div style="font-size:26px;font-weight:700;letter-spacing:-.5px"><span style="color:#e42527">Z</span><span style="color:#f9b21d">o</span><span style="color:#089949">h</span><span style="color:#226db4">o</span> <span style="color:#2c2c2c">Mail</span></div>`,
      heading: 'Sign in',
      sub: 'to continue to Zoho Mail',
      note: 'Use your organisation account.',
    }),
  },
  {
    id: 'docusign',
    name: 'DocuSign — review & sign',
    html: page({
      bg: '#f3f4f6',
      logo: `${badge('DS', '#f7b500', '#2b2b2b')} <span style="font-weight:800;font-size:20px;color:#2b2b2b;vertical-align:middle">DocuSign</span>`,
      heading: 'You have a document to review',
      sub: 'Sign in to open and sign the document',
      note: 'Please review before signing.',
    }),
  },
  {
    id: 'gdrive',
    name: 'Google Drive — file shared',
    html: page({
      bg: '#ffffff',
      logo: `<div style="width:0;height:0;margin:0 auto;border-left:16px solid #1a73e8;border-right:16px solid #34a853;border-bottom:28px solid #fbbc05"></div><div style="margin-top:8px;font-size:16px;color:#5f6368">Google Drive</div>`,
      heading: 'A file has been shared with you',
      sub: 'Sign in with your work account to view it',
      cardStyle:
        'width:100%;max-width:440px;background:#fff;border:1px solid #dadce0;border-radius:16px;padding:40px;text-align:center',
    }),
  },
  {
    id: 'dropbox',
    name: 'Dropbox — file shared',
    html: page({
      bg: '#f7f9fc',
      logo: `<span style="display:inline-block;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:20px solid #0061ff"></span> <span style="font-weight:700;font-size:20px;color:#0061ff;vertical-align:middle">Dropbox</span>`,
      heading: 'Someone shared a file with you',
      sub: 'Sign in to Dropbox to download it',
    }),
  },
  {
    id: 'teams',
    name: 'Microsoft Teams — sign in',
    html: page({
      bg: '#f5f5f8',
      logo: `${badge('T', '#6264a7')} <span style="font-weight:600;font-size:18px;color:#464775;vertical-align:middle">Microsoft Teams</span>`,
      heading: 'Sign in',
      sub: 'to continue to Microsoft Teams',
      note: 'Use your work or school account.',
    }),
  },
  {
    id: 'adobe',
    name: 'Adobe Acrobat — review PDF',
    html: page({
      bg: '#fafafa',
      logo: `${badge('A', '#fa0f00')} <span style="font-weight:700;font-size:18px;color:#2b2b2b;vertical-align:middle">Adobe Acrobat</span>`,
      heading: 'A PDF has been shared for review',
      sub: 'Sign in to open it in Acrobat',
    }),
  },
  {
    id: 'odoo',
    name: 'Odoo — sign in',
    html: page({
      bg: '#f1eef4',
      logo: `<span style="font-weight:700;font-size:26px;color:#714b67;letter-spacing:-1px">odoo</span>`,
      heading: 'Sign in',
      sub: 'to continue to your Odoo workspace',
      note: 'Enter your Odoo credentials.',
    }),
  },
  {
    id: 'vpn',
    name: 'Remote access (VPN/Citrix)',
    html: page({
      bg: '#eef2f6',
      logo: `<div style="font-size:26px">🔒</div><div style="margin-top:6px;font-weight:700;font-size:18px;color:#1b3a57">Secure Remote Access</div>`,
      heading: 'Sign in to continue',
      sub: 'Your session needs re-authentication to stay connected',
      note: 'Authorised users only.',
    }),
  },
  {
    id: 'courier',
    name: 'Delivery — confirm details',
    html: page({
      bg: '#fff8ed',
      logo: `<div style="font-size:26px">📦</div><div style="margin-top:6px;font-weight:700;font-size:18px;color:#b45309">Delivery Notice</div>`,
      heading: 'We could not complete your delivery',
      sub: 'Sign in to confirm your details and reschedule',
      note: 'A re-delivery fee may apply if not confirmed.',
    }),
  },
  {
    id: 'bankotp',
    name: 'Bank — verify account',
    html: page({
      bg: '#eef5f1',
      logo: `<div style="font-size:24px">🏦</div><div style="margin-top:6px;font-weight:700;font-size:18px;color:#14532d">Account Verification</div>`,
      heading: 'Verify your account to continue',
      sub: 'Sign in to confirm your identity',
      note: 'Never share your PIN or full card number.',
    }),
  },
];
