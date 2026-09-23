'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, Field, Notice, Table, inputClass, pct } from '@/components/ui';
import { Icon } from '@/components/icons';
import { readSession } from '@/lib/session';

interface EmployeeRisk {
  employeeId: string;
  name: string;
  email: string;
  department: string | null;
  sends: number;
  clicks: number;
  reports: number;
  credentialSubmissions: number;
  quizPasses: number;
  clickRate: number;
  riskScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  repeatClicker: boolean;
  breakdown: Array<{ factor: string; detail: string; points: number }>;
}
interface TrainingModule { id: string; title: string }

interface RiskAdvice {
  summary: string;
  actions: string[];
  assignments: Array<{
    employeeId: string;
    employeeName: string;
    moduleId: string;
    moduleTitle: string;
    reason: string;
  }>;
  generatedAt: string;
}

const levelColor: Record<string, string> = {
  low: 'text-brand-700',
  moderate: 'text-amber-700',
  high: 'text-orange-300',
  critical: 'text-red-600',
};

export default function RiskPage() {
  return (
    <Guard allow={['client_admin', 'client_viewer']}>
      <Risk />
    </Guard>
  );
}

function Risk() {
  const tenantId = useActingTenant();
  const [rows, setRows] = useState<EmployeeRisk[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<RiskAdvice | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [advising, setAdvising] = useState(false);
  // The advice endpoint is client_admin only — a viewer must not be offered a
  // button that spends the tenant's AI budget and then returns 403.
  const canAskAi = readSession()?.role === 'client_admin';

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [r, m] = await Promise.all([
        api.get<EmployeeRisk[]>(`/tenants/${tenantId}/employees/risk`),
        api.get<TrainingModule[]>(`/tenants/${tenantId}/training-modules`),
      ]);
      setRows(r);
      setModules(m);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Authenticated fetch to a blob, since both export routes need the bearer token. */
  async function downloadFile(path: string, filename: string, body?: unknown) {
    const token = readSession()?.accessToken;
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status}).`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function askAi() {
    setAdvising(true);
    setError(null);
    setOk(null);
    try {
      setAdvice(await api.post<RiskAdvice>(`/tenants/${tenantId}/employees/risk/advice`, {}));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdvising(false);
    }
  }

  async function enrol() {
    if (!moduleId) {
      setError('Pick a remediation module first.');
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.post<{ repeatClickers: number; newlyEnrolled: number }>(
        `/tenants/${tenantId}/employees/repeat-clickers/enrol`,
        { trainingModuleId: moduleId },
      );
      setOk(`${res.repeatClickers} repeat clickers found; ${res.newlyEnrolled} newly enrolled in remediation.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const repeatClickers = rows.filter((r) => r.repeatClicker);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Employee risk</h1>
          <p className="mt-1 text-xs text-slate-500">
            A running score per person across every campaign. Higher = more likely to fall for a real
            attack. Reporting and quiz passes lower it; clicks and credential entry raise it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={busy || !rows.length}
            onClick={() => downloadFile(`/tenants/${tenantId}/employees/risk/export.csv`, 'employee-risk.csv')}
          >
            Export CSV
          </Button>
          <Button
            variant="ghost"
            disabled={busy || !rows.length}
            onClick={() =>
              downloadFile(
                `/tenants/${tenantId}/employees/risk/report.pdf`,
                'employee-risk-report.pdf',
                // Send the advice already on screen rather than regenerating it,
                // so the document matches what the admin just read.
                { advice: advice ?? null },
              )
            }
          >
            {advice ? 'Export report (PDF)' : 'Export table (PDF)'}
          </Button>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      {canAskAi && (
        <Card
          title="Vlumeaware AI"
          subtitle="Reads the scores below and says what to do about them."
          actions={
            <Button onClick={askAi} disabled={advising || !rows.length}>
              <span className="flex items-center gap-1.5">
                <Icon name="sparkles" />
                {advising ? 'Reading the risk table…' : advice ? 'Ask again' : 'Recommend actions'}
              </span>
            </Button>
          }
        >
          {!advice && !advising && (
            <p className="text-xs text-slate-500">
              {rows.length
                ? 'Nothing is sent to the assistant until you ask. It sees this table and your training modules, with no message content and no employee email addresses.'
                : 'No employees have been through a simulation yet, so there is nothing to assess.'}
            </p>
          )}

          {advice && (
            <div className="space-y-4">
              <p className="text-sm text-slate-700">{advice.summary}</p>

              {advice.actions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    What to do
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {advice.actions.map((action) => (
                      <li key={action} className="flex gap-2 text-sm text-slate-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {advice.assignments.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Training to assign
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {advice.assignments.map((a) => (
                      <li
                        key={`${a.employeeId}-${a.moduleId}`}
                        className="rounded-lg border border-slate-200 p-3 text-sm"
                      >
                        <div className="text-slate-900">
                          <span className="font-medium">{a.employeeName}</span>
                          <span className="text-slate-400"> → </span>
                          <span className="font-medium">{a.moduleTitle}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{a.reason}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-400">
                    These are suggestions. Assign them from the Training page, or use the remediation
                    enrolment below.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                Generated {new Date(advice.generatedAt).toLocaleString()} from the table below.
                Judgement stays yours.
              </p>
            </div>
          )}
        </Card>
      )}

      <Card
        title={`Repeat clickers (${repeatClickers.length})`}
        subtitle="Clicked in two or more simulations — auto-enrol them into a remediation module."
      >
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Remediation module">
            <select className={inputClass} value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              <option value="">— choose —</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </Field>
          <Button onClick={enrol} disabled={busy || !repeatClickers.length}>
            Auto-enrol {repeatClickers.length} repeat clickers
          </Button>
        </div>
      </Card>

      <Card
        title="How the score is calculated"
        subtitle="A transparent 0–100 score from each person's whole simulation history. Risk goes up for clicking and submitting, down for reporting and passing quizzes."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-3">Factor</th>
                <th className="py-1 pr-3">Weight</th>
                <th className="py-1">Effect</th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              <tr><td className="py-1 pr-3">Click rate</td><td className="py-1 pr-3 font-mono">clicks ÷ sends × 60</td><td className="py-1 text-red-600">raises</td></tr>
              <tr><td className="py-1 pr-3">Credentials submitted</td><td className="py-1 pr-3 font-mono">submits ÷ sends × 40</td><td className="py-1 text-red-600">raises</td></tr>
              <tr><td className="py-1 pr-3">Repeat clicks</td><td className="py-1 pr-3 font-mono">min(clicks, 5) × 4</td><td className="py-1 text-red-600">raises</td></tr>
              <tr><td className="py-1 pr-3">Reported the phish</td><td className="py-1 pr-3 font-mono">reports ÷ sends × 25</td><td className="py-1 text-brand-700">lowers</td></tr>
              <tr><td className="py-1 pr-3">Quiz passes</td><td className="py-1 pr-3 font-mono">min(passes, 5) × 3</td><td className="py-1 text-brand-700">lowers</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Total is clamped to 0–100. Bands: <strong>0–24 low · 25–49 moderate · 50–74 high · 75–100 critical</strong>.
          Click any employee&rsquo;s score below to see their exact points.
        </p>
      </Card>

      <Card title="All employees by risk">
        <Table head={['Employee', 'Dept', 'Score', 'Level', 'Sends', 'Clicks', 'Reports', 'Quiz passes']}>
          {rows.map((e) => (
            <Fragment key={e.employeeId}>
              <tr
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                onClick={() => setExpanded(expanded === e.employeeId ? null : e.employeeId)}
              >
                <td className="px-2 py-2">
                  {e.name}
                  {e.repeatClicker && <span className="ml-2 text-[10px] text-red-600">repeat clicker</span>}
                </td>
                <td className="px-2 py-2 text-slate-500">{e.department ?? '—'}</td>
                <td className="px-2 py-2 font-semibold underline decoration-dotted">{e.riskScore}</td>
                <td className={`px-2 py-2 font-medium ${levelColor[e.riskLevel]}`}>{e.riskLevel}</td>
                <td className="px-2 py-2">{e.sends}</td>
                <td className="px-2 py-2">{e.clicks}</td>
                <td className="px-2 py-2">{e.reports}</td>
                <td className="px-2 py-2">{e.quizPasses}</td>
              </tr>
              {expanded === e.employeeId && (
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-600">How {e.name}&rsquo;s {e.riskScore} was reached</div>
                    <table className="mt-1 w-full max-w-lg text-left text-[12px]">
                      <tbody>
                        {e.breakdown.map((b) => (
                          <tr key={b.factor}>
                            <td className="py-0.5 pr-3 text-slate-600">{b.factor}</td>
                            <td className="py-0.5 pr-3 font-mono text-slate-400">{b.detail}</td>
                            <td className={`py-0.5 text-right font-semibold ${b.points > 0 ? 'text-red-600' : b.points < 0 ? 'text-brand-700' : 'text-slate-400'}`}>
                              {b.points > 0 ? '+' : ''}{b.points}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-slate-200">
                          <td className="py-1 pr-3 font-semibold text-slate-700">Total (clamped 0–100)</td>
                          <td />
                          <td className="py-1 text-right font-semibold text-slate-900">{e.riskScore}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={8} className="px-2 py-6 text-center text-slate-500">
                No employees yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
