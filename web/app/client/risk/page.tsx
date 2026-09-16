'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, Field, Notice, Table, inputClass, pct } from '@/components/ui';

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
}
interface TrainingModule { id: string; title: string }

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
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Employee risk</h1>
        <p className="mt-1 text-xs text-slate-500">
          A running score per person across every campaign. Higher = more likely to fall for a real
          attack. Reporting and quiz passes lower it; clicks and credential entry raise it.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

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

      <Card title="All employees by risk">
        <Table head={['Employee', 'Dept', 'Score', 'Level', 'Sends', 'Clicks', 'Reports', 'Quiz passes']}>
          {rows.map((e) => (
            <tr key={e.employeeId} className="border-b border-slate-100">
              <td className="px-2 py-2">
                {e.name}
                {e.repeatClicker && <span className="ml-2 text-[10px] text-red-600">repeat clicker</span>}
              </td>
              <td className="px-2 py-2 text-slate-500">{e.department ?? '—'}</td>
              <td className="px-2 py-2 font-semibold">{e.riskScore}</td>
              <td className={`px-2 py-2 font-medium ${levelColor[e.riskLevel]}`}>{e.riskLevel}</td>
              <td className="px-2 py-2">{e.sends}</td>
              <td className="px-2 py-2">{e.clicks}</td>
              <td className="px-2 py-2">{e.reports}</td>
              <td className="px-2 py-2">{e.quizPasses}</td>
            </tr>
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
