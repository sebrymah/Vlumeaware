'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Card, Notice, Table } from '@/components/ui';

interface PhishReport {
  id: string;
  reporterEmail: string;
  subject: string | null;
  sender: string | null;
  matchedSimulation: boolean;
  createdAt: string;
  employee: { name: string; email: string; department: string | null } | null;
}

export default function ReportedPage() {
  return (
    <Guard allow={['client_admin', 'client_viewer']}>
      <Reported />
    </Guard>
  );
}

function Reported() {
  const tenantId = useActingTenant();
  const [rows, setRows] = useState<PhishReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setRows(await api.get<PhishReport[]>(`/tenants/${tenantId}/phish-reports`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Reported emails</h1>
        <p className="mt-1 text-xs text-slate-500">
          Real emails your staff forwarded to the monitored report-a-phish address. A report matched
          to one of our simulations is tagged, so genuine threats stand out from training traffic.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <Card title="Reports">
        <Table head={['Reported by', 'Subject', 'Sender', 'Type', 'When']}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{r.employee?.name ?? r.reporterEmail}</td>
              <td className="px-2 py-2">{r.subject ?? '—'}</td>
              <td className="px-2 py-2 text-slate-500">{r.sender ?? '—'}</td>
              <td className="px-2 py-2">
                <Badge>{r.matchedSimulation ? 'simulation' : 'real'}</Badge>
              </td>
              <td className="px-2 py-2 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                No reports yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
