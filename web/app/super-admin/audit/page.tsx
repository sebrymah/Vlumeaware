'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard } from '@/components/guard';
import { Card, Notice, Table, inputClass } from '@/components/ui';

interface AuditEntry {
  id: string;
  tenantId: string | null;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
}
interface Tenant { id: string; name: string }

export default function AuditPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <Audit />
    </Guard>
  );
}

function Audit() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (tenantId) qs.set('tenantId', tenantId);
      if (action) qs.set('action', action);
      const [logs, t] = await Promise.all([
        api.get<AuditEntry[]>(`/audit-logs${qs.toString() ? `?${qs}` : ''}`),
        api.get<Tenant[]>('/tenants'),
      ]);
      setRows(logs);
      setTenants(t);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId, action]);

  useEffect(() => {
    void load();
  }, [load]);

  const tenantName = (id: string | null) => (id ? tenants.find((t) => t.id === id)?.name ?? id.slice(0, 8) : '—');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Audit log</h1>
        <p className="mt-1 text-xs text-slate-500">
          Append-only record of sensitive actions across all tenants — campaign creation, launch,
          kill, scheduling. Cross-tenant reads by staff are also captured here.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">
          Client
          <select className={`${inputClass} mt-1`} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">All</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Action contains
          <input className={`${inputClass} mt-1`} value={action} onChange={(e) => setAction(e.target.value)} placeholder="campaign.launch" />
        </label>
        <span className="text-xs text-slate-500">{rows.length} entries</span>
      </div>

      <Card title="Entries">
        <Table head={['When', 'Client', 'Actor', 'Action', 'Detail']}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="px-2 py-2 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
              <td className="px-2 py-2">{tenantName(r.tenantId)}</td>
              <td className="px-2 py-2 text-slate-500">{r.actorRole ?? '—'}</td>
              <td className="px-2 py-2 font-mono text-[11px]">{r.action}</td>
              <td className="px-2 py-2 text-slate-500">{r.detail ?? '—'}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                No audit entries yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
