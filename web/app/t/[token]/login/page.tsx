import { LoginForm } from './login-form';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Branding {
  tenant: { name: string; brandLogoUrl: string | null; brandPrimaryColor: string | null };
  senderSpoofName: string;
  landingTemplate: string;
  customHtml: string | null;
}

const LOGIN_FORM_MARKER = '{{LOGIN_FORM}}';

async function getBranding(token: string): Promise<Branding | null> {
  const res = await fetch(`${BASE}/track/branding/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Branding;
}

/**
 * Simulated login page. Reached by clicking the tracked link; the click is
 * already recorded server-side before the redirect here. This page never
 * transmits anything the employee types — the form derives non-reversible
 * metadata (field lengths, whether the entry looked email-shaped) in the
 * browser and posts only those. On submit, or via the skip link, the employee
 * is taken to the teachable-moment reveal.
 *
 * The chrome around the form follows the campaign's landing template so the
 * page resembles the portal staff actually sign in to; only the appearance
 * changes, never the metadata-only capture.
 */
export default async function SimulatedLoginPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const branding = await getBranding(token);

  if (!branding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">This link is no longer valid</h1>
          <p className="mt-2 text-sm text-slate-600">
            If an email asked you to open it, treat it as suspicious and report it to IT.
          </p>
        </div>
      </div>
    );
  }

  const template = branding.landingTemplate || 'generic';
  const name = branding.tenant.name;

  // Client-authored custom page: the HTML is already sanitized server-side
  // (appearance only). We inject the metadata-only form at the marker, or after
  // the content when there is no marker — so the only working form is ours.
  if (template === 'custom' && branding.customHtml) {
    const accent = branding.tenant.brandPrimaryColor ?? '#1F6F43';
    const idx = branding.customHtml.indexOf(LOGIN_FORM_MARKER);
    const before = idx >= 0 ? branding.customHtml.slice(0, idx) : branding.customHtml;
    const after = idx >= 0 ? branding.customHtml.slice(idx + LOGIN_FORM_MARKER.length) : '';
    return (
      <div className="min-h-screen bg-white">
        {before && <div dangerouslySetInnerHTML={{ __html: before }} />}
        <div className="mx-auto w-full max-w-sm px-6 py-6">
          <LoginForm token={token} accent={accent} />
        </div>
        {after && <div dangerouslySetInnerHTML={{ __html: after }} />}
      </div>
    );
  }

  if (template === 'microsoft') {
    return (
      <Shell background="#f2f2f2">
        <div className="w-full max-w-[440px] bg-white px-11 py-11 shadow-[0_2px_6px_rgba(0,0,0,0.2)]">
          <MicrosoftMark />
          <h1 className="mt-4 text-[24px] font-semibold text-[#1b1b1b]">Sign in</h1>
          <p className="mt-1 text-sm text-[#1b1b1b]">to continue to {name}</p>
          <LoginForm token={token} accent="#0067b8" emailLabel="Email, phone, or Skype" />
          <p className="mt-6 text-xs text-[#666]">Use your work or school account.</p>
        </div>
      </Shell>
    );
  }

  if (template === 'google') {
    return (
      <Shell background="#ffffff">
        <div className="w-full max-w-[448px] rounded-[28px] border border-[#dadce0] px-10 py-10 text-center">
          <GoogleMark />
          <h1 className="mt-3 text-[24px] font-normal text-[#202124]">Sign in</h1>
          <p className="mt-1 text-[16px] text-[#202124]">to continue to {name}</p>
          <div className="mt-4 text-left">
            <LoginForm token={token} accent="#1a73e8" emailLabel="Email or phone" />
          </div>
        </div>
      </Shell>
    );
  }

  if (template === 'okta') {
    return (
      <Shell background="#f9f9f9">
        <div className="w-full max-w-[400px] rounded-md border border-[#e1e1e1] bg-white px-8 py-9 text-center shadow-sm">
          {branding.tenant.brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.tenant.brandLogoUrl} alt={name} className="mx-auto h-10 w-auto" />
          ) : (
            <div className="text-lg font-semibold text-[#00297a]">{name}</div>
          )}
          <h1 className="mt-5 text-[20px] font-normal text-[#5e5e5e]">Sign In</h1>
          <div className="mt-3 text-left">
            <LoginForm token={token} accent="#00297a" emailLabel="Username" />
          </div>
        </div>
      </Shell>
    );
  }

  // generic — the tenant's own brand
  const accent = branding.tenant.brandPrimaryColor ?? '#1F6F43';
  return (
    <Shell background="#f1f5f4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-center px-6 py-6" style={{ background: accent }}>
          {branding.tenant.brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.tenant.brandLogoUrl} alt={name} className="h-8 w-auto" />
          ) : (
            <span className="text-base font-semibold text-white">{name}</span>
          )}
        </div>
        <div className="px-6 py-7">
          <h1 className="text-base font-semibold text-slate-900">Sign in to continue</h1>
          <p className="mt-1 text-xs text-slate-500">
            {branding.senderSpoofName} · {name} single sign-on
          </p>
          <LoginForm token={token} accent={accent} />
        </div>
      </div>
    </Shell>
  );
}

function Shell({ background, children }: { background: string; children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-6 py-10"
      style={{ background }}
    >
      {children}
    </div>
  );
}

/** Microsoft's four-square mark, drawn in CSS so no external asset is needed. */
function MicrosoftMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid grid-cols-2 gap-[2px]">
        <span className="h-[9px] w-[9px] bg-[#f25022]" />
        <span className="h-[9px] w-[9px] bg-[#7fba00]" />
        <span className="h-[9px] w-[9px] bg-[#00a4ef]" />
        <span className="h-[9px] w-[9px] bg-[#ffb900]" />
      </div>
      <span className="text-[15px] font-semibold text-[#5e5e5e]">Microsoft</span>
    </div>
  );
}

/** Google's multicolour "G", inline SVG. */
function GoogleMark() {
  return (
    <svg className="mx-auto h-[48px] w-[48px]" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45 24c0-1.6-.1-2.8-.4-4H24v7.6h12c-.2 1.9-1.5 4.8-4.3 6.7l6.6 5.1C42.2 36 45 30.6 45 24z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.8-1.9 14.4-5.3l-6.6-5.1c-1.8 1.2-4.2 2-7.8 2-6 0-11-4-12.8-9.5l-6.8 5.3C7.9 40.9 15.3 46 24 46z" />
      <path fill="#FBBC05" d="M11.2 28.1c-.5-1.4-.7-2.8-.7-4.1s.2-2.7.7-4.1l-6.8-5.3C3 17.4 2.3 20.6 2.3 24s.7 6.6 2.1 9.4l6.8-5.3z" />
      <path fill="#EA4335" d="M24 10.5c3.4 0 5.6 1.5 6.9 2.7l5.8-5.7C33.2 4.1 28.9 2 24 2 15.3 2 7.9 7.1 4.4 14.6l6.8 5.3C13 14.5 18 10.5 24 10.5z" />
    </svg>
  );
}
