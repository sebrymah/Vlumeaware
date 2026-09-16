'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Card, Notice, Stat, Table, pct } from '@/components/ui';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Dashboard>(`/tenants/${tenantId}/reports/${campaignId}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId, campaignId]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">{m.campaignName}</h1>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Badge>{m.status}</Badge>
            <span>
              {m.totalSent} of {m.totalRecipients} simulations delivered
            </span>
          </p>
        </div>
        <div className="flex gap-2">
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

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Open rate" value={pct(m.openRate)} hint={`${m.opened} opened`} />
        <Stat label="Click rate" value={pct(m.clickRate)} hint={`${m.clicked} clicked`} />
        <Stat label="Report rate" value={pct(m.reportRate)} hint={`${m.reported} reported first`} />
        <Stat
          label="Credentials entered"
          value={String(m.credentialsSubmitted)}
          hint="count only — no submitted values are stored"
        />
      </div>

      <Card title="Board narrative" subtitle="Written in Vlumetech's governance tone.">
        {data.narrative ? (
          <div className="space-y-3 text-sm leading-relaxed text-slate-300">
            {data.narrative.split('\n').filter(Boolean).map((para, i) => {
              const heading = /^(Summary|What The Numbers Show|Risk Assessment|Recommended Actions)/i.test(
                para.trim(),
              );
              return heading ? (
                <h3 key={i} className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
            <tr key={d.department} className="border-b border-slate-800/60">
              <td className="px-2 py-2">{d.department}</td>
              <td className="px-2 py-2">{d.sent}</td>
              <td className="px-2 py-2">{d.clicked}</td>
              <td className="px-2 py-2">{pct(d.clickRate)}</td>
              <td className="px-2 py-2">
                <div className="h-1.5 w-full rounded bg-slate-800">
                  <div
                    className="h-1.5 rounded bg-emerald-600"
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
