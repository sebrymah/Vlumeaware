import { LoginForm } from './login-form';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Branding {
  tenant: { name: string; brandLogoUrl: string | null; brandPrimaryColor: string | null };
  senderSpoofName: string;
}

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

  const accent = branding.tenant.brandPrimaryColor ?? '#1F6F43';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-center px-6 py-6" style={{ background: accent }}>
            {branding.tenant.brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.tenant.brandLogoUrl} alt={branding.tenant.name} className="h-8 w-auto" />
            ) : (
              <span className="text-base font-semibold text-white">{branding.tenant.name}</span>
            )}
          </div>
          <div className="px-6 py-7">
            <h1 className="text-base font-semibold text-slate-900">Sign in to continue</h1>
            <p className="mt-1 text-xs text-slate-500">
              {branding.senderSpoofName} · {branding.tenant.name} single sign-on
            </p>
            <LoginForm token={token} accent={accent} />
          </div>
        </div>
      </div>
    </div>
  );
}
