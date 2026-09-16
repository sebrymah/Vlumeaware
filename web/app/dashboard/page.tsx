'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { CampaignReport } from '@/components/report';
import { Badge, Card, Notice, Table, pct } from '@/components/ui';

interface TrendRow {
  campaignId: string;
  name: string;
  createdAt: string;
  status: string;
  clickRate: number;
  reportRate: number;
  totalSent: number;
}

export default function DashboardPage() {
  return (
    <Guard allow={['client_viewer']}>
      <Dashboard />
    </Guard>
  );
}

function Dashboard() {
  const tenantId = useActingTenant();
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const rows = await api.get<TrendRow[]>(`/tenants/${tenantId}/reports/trend`);
      setTrend(rows);
      const ran = rows.filter((r) => r.totalSent > 0);
      setSelected(ran.length ? ran[ran.length - 1].campaignId : null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Reporting</h1>
        <p className="mt-1 text-xs text-slate-500">Read-only view of your awareness programme.</p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <Card title="Campaign trend" subtitle="Click a campaign to see its full report below.">
        <Table head={['Campaign', 'Status', 'Delivered', 'Click rate', 'Report rate', 'Date']}>
          {trend.map((r) => (
            <tr
              key={r.campaignId}
              onClick={() => setSelected(r.campaignId)}
              className={`cursor-pointer border-b border-slate-800/60 hover:bg-slate-800/40 ${
                selected === r.campaignId ? 'bg-slate-800/60' : ''
              }`}
            >
              <td className="px-2 py-2 text-emerald-400">{r.name}</td>
              <td className="px-2 py-2">
                <Badge>{r.status}</Badge>
              </td>
              <td className="px-2 py-2">{r.totalSent}</td>
              <td className="px-2 py-2">{pct(r.clickRate)}</td>
              <td className="px-2 py-2">{pct(r.reportRate)}</td>
              <td className="px-2 py-2 text-slate-400">
                {new Date(r.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
          {!trend.length && (
            <tr>
              <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                No campaigns have run yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      {selected && <CampaignReport tenantId={tenantId} campaignId={selected} canGenerate={false} />}
    </div>
  );
}
