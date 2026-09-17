'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Button, Card, Field, Notice, Table, inputClass } from '@/components/ui';

interface Employee {
  id: string;
  email: string;
  name: string;
  department: string | null;
}

interface UploadResult {
  created: number;
  updated: number;
  skipped: Array<{ row: number; email?: string; reason: string }>;
}

export default function EmployeesPage() {
  return (
    <Guard allow={['client_admin']}>
      <Employees />
    </Guard>
  );
}

function Employees() {
  const tenantId = useActingTenant();
  const [list, setList] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [seats, setSeats] = useState<{ used: number; seatLimit: number | null; remaining: number | null; licenseTier: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // single-employee add
  const [oneName, setOneName] = useState('');
  const [oneEmail, setOneEmail] = useState('');
  const [oneDept, setOneDept] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [roster, usage] = await Promise.all([
        api.get<Employee[]>(`/tenants/${tenantId}/employees`),
        api.get<{ used: number; seatLimit: number | null; remaining: number | null; licenseTier: string | null }>(
          `/tenants/${tenantId}/seats`,
        ),
      ]);
      setList(roster);
      setSeats(usage);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      setResult(await api.upload<UploadResult>(`/tenants/${tenantId}/employees/csv`, form));
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    setResult(null);
    try {
      const res = await api.post<UploadResult>(`/tenants/${tenantId}/employees`, {
        employees: [{ name: oneName, email: oneEmail, department: oneDept || undefined }],
      });
      if (res.skipped.length > 0) {
        setError(`Not added: ${res.skipped[0].reason}`);
      } else {
        setOk(res.created ? `${oneName} added to the roster.` : `${oneName} updated.`);
        setOneName('');
        setOneEmail('');
        setOneDept('');
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.del(`/tenants/${tenantId}/employees/${id}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const byDept = list.reduce<Record<string, number>>((acc, e) => {
    const key = e.department?.trim() || 'Unassigned';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Employees</h1>
        <p className="mt-1 text-xs text-slate-500">
          {list.length} on the roster ·{' '}
          {Object.entries(byDept)
            .map(([d, n]) => `${d} ${n}`)
            .join(' · ')}
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      {seats && (
        <div
          className={`rounded border px-4 py-2 text-xs ${
            seats.remaining === 0
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {seats.seatLimit == null ? (
            <>Seats: <b>{seats.used}</b> used · unlimited{seats.licenseTier ? ` · ${seats.licenseTier}` : ''}</>
          ) : (
            <>
              Seats: <b>{seats.used}</b> of <b>{seats.seatLimit}</b> used ·{' '}
              <b>{seats.remaining}</b> remaining{seats.licenseTier ? ` · ${seats.licenseTier} tier` : ''}
              {seats.remaining === 0 && ' — seat limit reached; contact Vlumetech to upgrade.'}
            </>
          )}
        </div>
      )}

      <Card title="Add one employee" subtitle="You can only add people on a verified domain (People → Domains).">
        <form onSubmit={addOne} className="grid items-end gap-3 sm:grid-cols-4">
          <Field label="Name">
            <input className={inputClass} value={oneName} onChange={(ev) => setOneName(ev.target.value)} required minLength={2} />
          </Field>
          <Field label="Work email">
            <input className={inputClass} type="email" value={oneEmail} onChange={(ev) => setOneEmail(ev.target.value)} required />
          </Field>
          <Field label="Department (optional)">
            <input className={inputClass} value={oneDept} onChange={(ev) => setOneDept(ev.target.value)} placeholder="Finance" />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add employee'}
          </Button>
        </form>
      </Card>

      <Card title="Bulk upload" subtitle="CSV with email, name and department columns.">
        <form onSubmit={upload} className="flex items-end gap-3">
          <Field label="CSV file" hint="Existing employees are updated, not duplicated. Up to 5 MB.">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-xs text-slate-600" required />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
        </form>

        {result && (
          <div className="mt-4 space-y-2">
            <Notice kind="ok">
              {result.created} created, {result.updated} updated, {result.skipped.length} skipped.
            </Notice>
            {result.skipped.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border border-slate-200 p-2">
                <Table head={['Row', 'Value', 'Reason']}>
                  {result.skipped.map((s) => (
                    <tr key={`${s.row}-${s.email}`}>
                      <td className="px-2 py-1">{s.row}</td>
                      <td className="px-2 py-1 text-slate-500">{s.email || '(blank)'}</td>
                      <td className="px-2 py-1 text-amber-700">{s.reason}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Roster">
        <div className="max-h-[28rem] overflow-y-auto">
          <Table head={['Name', 'Email', 'Department', '']}>
            {list.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="px-2 py-2">{e.name}</td>
                <td className="px-2 py-2 text-slate-500">{e.email}</td>
                <td className="px-2 py-2">{e.department ?? '—'}</td>
                <td className="px-2 py-2 text-right">
                  <Button variant="ghost" onClick={() => remove(e.id)} disabled={busy}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                  No employees uploaded yet.
                </td>
              </tr>
            )}
          </Table>
        </div>
      </Card>
    </div>
  );
}
