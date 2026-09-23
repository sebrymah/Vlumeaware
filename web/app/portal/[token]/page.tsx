const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface TrainingItem {
  id: string;
  title: string;
  assignedAt: string;
  completedAt: string | null;
  estimatedMinutes: number | null;
  passingScorePct: number | null;
  personalBest: number | null;
  videoUrl: string | null;
}

interface Summary {
  employee: { name: string; email: string; department: string | null; tenant: string };
  stats: { averageScore: number | null; assigned: number; completed: number; badges: number };
  badges: Array<{ key: string; label: string }>;
  training: TrainingItem[];
  certificates: Array<{ serial: string; moduleTitle: string; scorePct: number; issuedAt: string; verifyUrl: string }>;
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
  return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: '2-digit' });
}
function scoreCls(v: number) {
  return v >= 100 ? 'text-brand-700' : v >= 80 ? 'text-emerald-600' : 'text-amber-600';
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

export default async function PortalDashboard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getSummary(token);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold text-slate-900">This link is invalid or expired</h1>
          <p className="mt-2 text-sm text-slate-600">Request a new one from your sign-in page.</p>
          <a href="/portal" className="mt-3 inline-block text-sm font-medium text-brand-700 underline">Get a new link</a>
        </div>
      </div>
    );
  }

  const { employee, stats, badges, training, certificates, history } = data;
  const assigned = training.filter((t) => !t.completedAt);
  const completed = training.filter((t) => t.completedAt);
  const certByTitle = new Map(certificates.map((c) => [c.moduleTitle.toLowerCase(), c]));

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Learner dashboard</h1>
            <p className="mt-1 text-xs text-slate-500">
              {employee.name} · {employee.tenant}
              {employee.department ? ` · ${employee.department}` : ''}
            </p>
          </div>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Average score" value={stats.averageScore != null ? `${stats.averageScore}%` : '—'} />
          <StatCard label="Assigned trainings" value={stats.assigned} />
          <StatCard label="Completed trainings" value={stats.completed} />
          <StatCard label="Badges earned" value={stats.badges} />
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Badges achieved</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((b) => (
                <span key={b.key} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-100">
                  ★ {b.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Assigned training */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Assigned training</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1 pr-3">Training module</th>
                  <th className="py-1 pr-3">Estimated time</th>
                  <th className="py-1 pr-3">Passing score</th>
                  <th className="py-1">Personal best</th>
                </tr>
              </thead>
              <tbody>
                {assigned.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">No trainings assigned.</td></tr>
                ) : (
                  assigned.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-900">{t.title}</div>
                        {t.videoUrl && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] font-medium text-brand-700">Watch the video</summary>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <video controls preload="none" className="mt-2 w-full max-w-md rounded-lg" src={t.videoUrl} />
                          </details>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{t.estimatedMinutes ? `${t.estimatedMinutes} min` : '—'}</td>
                      <td className="py-2 pr-3 text-slate-500">{t.passingScorePct != null ? `${t.passingScorePct}%` : '—'}</td>
                      <td className={`py-2 font-semibold ${t.personalBest != null ? scoreCls(t.personalBest) : 'text-slate-400'}`}>
                        {t.personalBest != null ? `${t.personalBest}%` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Completed training */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Completed training</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1 pr-3">Training module</th>
                  <th className="py-1 pr-3">Personal best</th>
                  <th className="py-1 pr-3">Completion date</th>
                  <th className="py-1">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {completed.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">Nothing completed yet.</td></tr>
                ) : (
                  completed.map((t) => {
                    const cert = certByTitle.get(t.title.toLowerCase());
                    return (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-900">{t.title}</div>
                          {t.videoUrl && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[11px] font-medium text-brand-700">Rewatch</summary>
                              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                              <video controls preload="none" className="mt-2 w-full max-w-md rounded-lg" src={t.videoUrl} />
                            </details>
                          )}
                        </td>
                        <td className={`py-2 pr-3 font-semibold ${t.personalBest != null ? scoreCls(t.personalBest) : 'text-slate-400'}`}>
                          {t.personalBest != null ? `${t.personalBest}%` : '—'}
                        </td>
                        <td className="py-2 pr-3 text-slate-500">{t.completedAt ? fmtDate(t.completedAt) : '—'}</td>
                        <td className="py-2">
                          {cert ? (
                            <a href={`${BASE}/verify/${encodeURIComponent(cert.serial)}/pdf`} className="font-medium text-brand-700 underline" target="_blank" rel="noopener noreferrer">
                              Download Certificate
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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

        <p className="pb-6 text-center text-[11px] text-slate-400">This dashboard is private to you. Powered by Vlumeaware.</p>
      </div>
    </div>
  );
}
