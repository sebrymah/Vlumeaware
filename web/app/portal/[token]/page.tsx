const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Summary {
  employee: { name: string; email: string; department: string | null; tenant: string };
  training: Array<{
    id: string;
    title: string;
    assignedAt: string;
    completedAt: string | null;
    durationSeconds: number | null;
    videoUrl: string | null;
  }>;
  certificates: Array<{
    serial: string;
    moduleTitle: string;
    quizTitle: string | null;
    scorePct: number;
    issuedAt: string;
    verifyUrl: string;
  }>;
  history: Array<{ id: string; subject: string; sender: string; sentAt: string; outcome: string }>;
}

async function getSummary(token: string): Promise<Summary | null> {
  const res = await fetch(`${BASE}/portal/${encodeURIComponent(token)}/summary`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as Summary;
}

const OUTCOME: Record<string, { label: string; cls: string }> = {
  reported: { label: 'Reported ✓', cls: 'text-brand-700' },
  submitted: { label: 'Submitted credentials', cls: 'text-red-600' },
  clicked: { label: 'Clicked', cls: 'text-amber-600' },
  'no action': { label: 'No action', cls: 'text-slate-500' },
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString();
}

export default async function PortalDashboard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getSummary(token);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold text-slate-900">This link is invalid or expired</h1>
          <p className="mt-2 text-sm text-slate-600">
            Request a new one from your training dashboard sign-in page.
          </p>
          <a href="/portal" className="mt-3 inline-block text-sm font-medium text-brand-700 underline">
            Get a new link
          </a>
        </div>
      </div>
    );
  }

  const { employee, training, certificates, history } = data;
  const done = training.filter((t) => t.completedAt).length;

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-xl font-semibold text-slate-900">Hi {employee.name.split(' ')[0]}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {employee.tenant} security awareness · {employee.email}
            {employee.department ? ` · ${employee.department}` : ''}
          </p>
        </header>

        {/* Training */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Your training</h2>
            <span className="text-[11px] text-slate-400">{done}/{training.length} completed</span>
          </div>
          {training.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No training assigned yet.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {training.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{t.title}</span>
                    {t.completedAt ? (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                        completed {fmtDate(t.completedAt)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        not yet completed
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-slate-400">assigned {fmtDate(t.assignedAt)}</span>
                  </div>
                  {t.videoUrl && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-brand-700">
                        {t.completedAt ? 'Rewatch' : 'Watch'} the video
                      </summary>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video controls preload="none" className="mt-2 w-full rounded-lg" src={t.videoUrl} />
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Certificates */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Your certificates</h2>
          {certificates.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Complete a course and pass its quiz to earn a certificate.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-3">Course</th>
                    <th className="py-1 pr-3">Score</th>
                    <th className="py-1 pr-3">Issued</th>
                    <th className="py-1">Verify</th>
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((c) => (
                    <tr key={c.serial} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{c.moduleTitle}</td>
                      <td className="py-2 pr-3">{c.scorePct}%</td>
                      <td className="py-2 pr-3 text-slate-500">{fmtDate(c.issuedAt)}</td>
                      <td className="py-2">
                        <a href={c.verifyUrl} className="text-brand-700 underline" target="_blank" rel="noopener noreferrer">
                          {c.serial}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Phishing history */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Your simulation history</h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No simulations yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-3">Simulated email</th>
                    <th className="py-1 pr-3">Date</th>
                    <th className="py-1">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const o = OUTCOME[h.outcome] ?? OUTCOME['no action'];
                    return (
                      <tr key={h.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3">{h.subject}</td>
                        <td className="py-2 pr-3 text-slate-500">{fmtDate(h.sentAt)}</td>
                        <td className={`py-2 font-medium ${o.cls}`}>{o.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="pb-6 text-center text-[11px] text-slate-400">
          This dashboard is private to you. Powered by Vlumeaware.
        </p>
      </div>
    </div>
  );
}
