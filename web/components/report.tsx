'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Card, ConfirmButton, Notice, Stat, Table, pct } from '@/components/ui';

export interface Metrics {
  campaignId: string;
  campaignName: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  opened: number;
  clicked: number;
  reported: number;
  credentialsSubmitted: number;
  submissionAnalytics: {
    submissions: number;
    avgPasswordLength: number | null;
    emailShapedUsernameRate: number | null;
    medianTimeToSubmitMs: number | null;
  };
  openRate: number;
  clickRate: number;
  reportRate: number;
  byDepartment: Array<{ department: string; sent: number; clicked: number; clickRate: number }>;
  trainingAssigned: number;
  trainingCompleted: number;
  quiz: {
    attempts: number;
    passed: number;
    passRate: number | null;
    avgScorePct: number | null;
  };
}

interface Dashboard {
  metrics: Metrics;
  narrative: string | null;
  generatedAt: string | null;
}

interface Recipient {
  employeeId: string;
  name: string;
  email: string;
  department: string | null;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  credentialsSubmitted: boolean;
  reportedAt: string | null;
}

interface TrainingModule {
  id: string;
  title: string;
}

type Stage = 'pending' | 'delivered' | 'opened' | 'clicked' | 'submitted' | 'reported';

/**
 * Cumulative funnel membership: "did this person reach AT LEAST this stage?"
 * A click proves an open and a submit proves a click, so the stages nest and
 * the chip counts match the headline funnel (opened >= clicked >= submitted)
 * instead of contradicting it. Counts therefore overlap on purpose — someone
 * who clicked is also counted under Opened.
 */
function reached(r: Recipient, stage: Stage): boolean {
  switch (stage) {
    case 'pending':
      return !r.sentAt;
    case 'delivered':
      return !!r.sentAt;
    case 'opened':
      return !!(r.openedAt || r.clickedAt || r.credentialsSubmitted || r.reportedAt);
    case 'clicked':
      return !!(r.clickedAt || r.credentialsSubmitted);
    case 'submitted':
      return r.credentialsSubmitted;
    case 'reported':
      return !!r.reportedAt;
  }
}

const STAGE_FILTERS: { key: Stage | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'opened', label: 'Opened' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'reported', label: 'Reported' },
];

function StatusPills({ r }: { r: Recipient }) {
  const pill = (label: string, tone: 'ok' | 'warn' | 'bad' | 'muted') => {
    const cls = {
      ok: 'bg-brand-50 text-brand-700 ring-brand-200',
      warn: 'bg-amber-50 text-amber-700 ring-amber-200',
      bad: 'bg-red-50 text-red-700 ring-red-200',
      muted: 'bg-slate-100 text-slate-500 ring-slate-200',
    }[tone];
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>
        {label}
      </span>
    );
  };
  const pills = [];
  if (r.reportedAt) pills.push(pill('Reported', 'ok'));
  if (r.credentialsSubmitted) pills.push(pill('Submitted', 'bad'));
  if (r.clickedAt) pills.push(pill('Clicked', 'bad'));
  if (r.openedAt) pills.push(pill('Opened', 'warn'));
  if (!pills.length) pills.push(r.sentAt ? pill('Delivered', 'muted') : pill('Pending', 'muted'));
  return <div className="flex flex-wrap gap-1">{pills}</div>;
}

/** Shared by the client_admin campaign view and the read-only viewer dashboard. */
export function CampaignReport({
  tenantId,
  campaignId,
  canGenerate,
}: {
  tenantId: string;
  campaignId: string;
  canGenerate: boolean;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [assignNote, setAssignNote] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Stage | 'all'>('all');

  const load = useCallback(async () => {
    try {
      const [dash, recips, mods] = await Promise.all([
        api.get<Dashboard>(`/tenants/${tenantId}/reports/${campaignId}`),
        api.get<Recipient[]>(`/tenants/${tenantId}/campaigns/${campaignId}/recipients`).catch(() => [] as Recipient[]),
        canGenerate
          ? api.get<TrainingModule[]>(`/tenants/${tenantId}/training-modules`).catch(() => [] as TrainingModule[])
          : Promise.resolve([] as TrainingModule[]),
      ]);
      setData(dash);
      setRecipients(recips);
      setModules(mods);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId, campaignId, canGenerate]);

  async function assignTraining(employeeId: string, trainingModuleId: string) {
    if (!trainingModuleId) return;
    setAssigningId(employeeId);
    try {
      const res = await api.post<{ alreadyAssigned?: boolean }>(
        `/tenants/${tenantId}/training-assignments`,
        { employeeId, trainingModuleId },
      );
      const title = modules.find((m) => m.id === trainingModuleId)?.title ?? 'module';
      setAssignNote((n) => ({
        ...n,
        [employeeId]: res.alreadyAssigned ? `Already had “${title}”` : `Assigned “${title}”`,
      }));
      await load();
    } catch (err) {
      setAssignNote((n) => ({ ...n, [employeeId]: (err as Error).message }));
    } finally {
      setAssigningId(null);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tenants/${tenantId}/reports/${campaignId}/generate`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retryUnsent() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.post<{ requeued: number; staleJobsCleared: number; windowMinutes: number }>(
        `/tenants/${tenantId}/campaigns/${campaignId}/retry`,
        { overMinutes: 120 },
      );
      setOk(
        `Re-queued ${res.requeued} unsent message${res.requeued === 1 ? '' : 's'}, dripping over ${res.windowMinutes} min. ` +
          `Watch the delivered count climb; if it stalls again, your email provider is still blocking.`,
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    const token = JSON.parse(localStorage.getItem('vlumeaware.session') ?? '{}').accessToken;
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const res = await fetch(`${base}/tenants/${tenantId}/reports/${campaignId}/export.csv`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${campaignId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const m = data.metrics;
  const worst = m.byDepartment[0];
  const unsent = m.totalRecipients - m.totalSent;

  const stageCounts: Record<Stage, number> = {
    pending: recipients.filter((r) => reached(r, 'pending')).length,
    delivered: recipients.filter((r) => reached(r, 'delivered')).length,
    opened: recipients.filter((r) => reached(r, 'opened')).length,
    clicked: recipients.filter((r) => reached(r, 'clicked')).length,
    submitted: recipients.filter((r) => reached(r, 'submitted')).length,
    reported: recipients.filter((r) => reached(r, 'reported')).length,
  };
  const filteredRecipients =
    statusFilter === 'all' ? recipients : recipients.filter((r) => reached(r, statusFilter));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{m.campaignName}</h1>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Badge>{m.status}</Badge>
            <span>
              {m.totalSent} of {m.totalRecipients} simulations delivered
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {canGenerate && m.status === 'active' && unsent > 0 && (
            <ConfirmButton
              label={`Retry ${unsent} unsent`}
              question={`Re-queue the ${unsent} message${unsent === 1 ? '' : 's'} that haven't sent yet, dripped over ~2 hours? Only do this once your email provider block is cleared, or they'll just fail again.`}
              onConfirm={retryUnsent}
              disabled={busy}
            />
          )}
          <Button variant="ghost" onClick={exportCsv}>
            Export CSV
          </Button>
          {canGenerate && (
            <Button onClick={generate} disabled={busy}>
              {busy ? 'Generating…' : 'Generate board narrative'}
            </Button>
          )}
        </div>
      </div>

      {ok && <Notice kind="ok">{ok}</Notice>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Open rate" value={pct(m.openRate)} hint={`${m.opened} opened`} />
        <Stat label="Click rate" value={pct(m.clickRate)} hint={`${m.clicked} clicked`} />
        <Stat label="Report rate" value={pct(m.reportRate)} hint={`${m.reported} reported first`} />
        <Stat
          label="Credential rate"
          value={pct(m.totalSent ? m.credentialsSubmitted / m.totalSent : 0)}
          hint={`${m.credentialsSubmitted} entered — count only, no values stored`}
        />
      </div>

      <Card title="Board narrative" subtitle="Written in Vlumetech's governance tone.">
        {data.narrative ? (
          <div className="space-y-3 text-sm leading-relaxed text-slate-600">
            {data.narrative.split('\n').filter(Boolean).map((para, i) => {
              const heading = /^(Summary|What The Numbers Show|Risk Assessment|Recommended Actions)/i.test(
                para.trim(),
              );
              return heading ? (
                <h3 key={i} className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {para.replace(/[:#*]/g, '').trim()}
                </h3>
              ) : (
                <p key={i}>{para.trim()}</p>
              );
            })}
            {data.generatedAt && (
              <p className="pt-2 text-[11px] text-slate-600">
                Generated {new Date(data.generatedAt).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <Notice kind="info">
            No narrative generated yet.{' '}
            {canGenerate
              ? 'Use “Generate board narrative” once the campaign has run.'
              : 'Ask your administrator to generate the report.'}
          </Notice>
        )}
      </Card>

      <Card
        title="Click rate by department"
        subtitle={worst ? `Highest exposure: ${worst.department} at ${pct(worst.clickRate)}` : undefined}
      >
        <Table head={['Department', 'Delivered', 'Clicked', 'Click rate', '']}>
          {m.byDepartment.map((d) => (
            <tr key={d.department} className="border-b border-slate-100">
              <td className="px-2 py-2">{d.department}</td>
              <td className="px-2 py-2">{d.sent}</td>
              <td className="px-2 py-2">{d.clicked}</td>
              <td className="px-2 py-2">{pct(d.clickRate)}</td>
              <td className="px-2 py-2">
                <div className="h-1.5 w-full rounded bg-slate-100">
                  <div
                    className="h-1.5 rounded bg-brand-600"
                    style={{ width: `${Math.round(d.clickRate * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
          {!m.byDepartment.length && (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                Nothing delivered yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      <Card
        title="Recipients"
        subtitle={`Who this went to and where each person is — ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}.`}
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {STAGE_FILTERS.map((f) => {
            const count = f.key === 'all' ? recipients.length : stageCounts[f.key];
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset transition ${
                  active
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label} <span className={active ? 'text-white/80' : 'text-slate-400'}>{count}</span>
              </button>
            );
          })}
        </div>
        <p className="mb-2 text-[11px] text-slate-500">
          Counts are cumulative — someone who clicked is also counted under Opened, so Opened ≥ Clicked ≥ Submitted.
        </p>
        <div className="max-h-[28rem] overflow-y-auto">
          <Table head={canGenerate ? ['Recipient', 'Department', 'Status', 'Assign training'] : ['Recipient', 'Department', 'Status']}>
            {filteredRecipients.map((r) => (
              <tr key={r.email} className="border-b border-slate-100">
                <td className="px-2 py-2">
                  <div className="font-medium text-slate-800">{r.name}</div>
                  <div className="text-[11px] text-slate-500">{r.email}</div>
                </td>
                <td className="px-2 py-2 text-slate-500">{r.department ?? '—'}</td>
                <td className="px-2 py-2"><StatusPills r={r} /></td>
                {canGenerate && (
                  <td className="px-2 py-2">
                    {modules.length ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700 disabled:opacity-50"
                          defaultValue=""
                          disabled={assigningId === r.employeeId}
                          onChange={(e) => {
                            const v = e.target.value;
                            e.target.value = '';
                            void assignTraining(r.employeeId, v);
                          }}
                        >
                          <option value="" disabled>
                            {assigningId === r.employeeId ? 'Assigning…' : 'Assign a module…'}
                          </option>
                          {modules.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title}
                            </option>
                          ))}
                        </select>
                        {assignNote[r.employeeId] && (
                          <span className="text-[11px] text-brand-700">{assignNote[r.employeeId]}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">Add a module first</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!recipients.length && (
              <tr>
                <td colSpan={canGenerate ? 4 : 3} className="px-2 py-6 text-center text-slate-500">
                  No recipients yet — launch the campaign to generate sends.
                </td>
              </tr>
            )}
            {recipients.length > 0 && !filteredRecipients.length && (
              <tr>
                <td colSpan={canGenerate ? 4 : 3} className="px-2 py-6 text-center text-slate-500">
                  Nobody reached the “{statusFilter}” stage.
                </td>
              </tr>
            )}
          </Table>
        </div>
      </Card>

      {m.submissionAnalytics.submissions > 0 && (
        <Card
          title="Simulated login submissions"
          subtitle="Metadata only — no submitted username or password is ever stored."
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Submissions" value={String(m.submissionAnalytics.submissions)} />
            <Stat
              label="Avg password length"
              value={
                m.submissionAnalytics.avgPasswordLength != null
                  ? m.submissionAnalytics.avgPasswordLength.toFixed(1)
                  : '—'
              }
            />
            <Stat
              label="Email-shaped username"
              value={
                m.submissionAnalytics.emailShapedUsernameRate != null
                  ? pct(m.submissionAnalytics.emailShapedUsernameRate)
                  : '—'
              }
              hint="looked like real work credentials"
            />
            <Stat
              label="Median time to submit"
              value={
                m.submissionAnalytics.medianTimeToSubmitMs != null
                  ? `${(m.submissionAnalytics.medianTimeToSubmitMs / 1000).toFixed(1)}s`
                  : '—'
              }
              hint="from click to submission"
            />
          </div>
        </Card>
      )}

      <Card title="Training loop">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Modules assigned" value={String(m.trainingAssigned)} />
          <Stat label="Completed" value={String(m.trainingCompleted)} />
          <Stat
            label="Completion"
            value={m.trainingAssigned ? pct(m.trainingCompleted / m.trainingAssigned) : '—'}
          />
        </div>
        {m.quiz.attempts > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Quiz attempts" value={String(m.quiz.attempts)} />
            <Stat label="Quiz pass rate" value={m.quiz.passRate != null ? pct(m.quiz.passRate) : '—'} />
            <Stat label="Avg quiz score" value={m.quiz.avgScorePct != null ? pct(m.quiz.avgScorePct) : '—'} />
          </div>
        )}
      </Card>
    </div>
  );
}
