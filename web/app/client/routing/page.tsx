'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, Notice, Table, inputClass } from '@/components/ui';

interface Scenario {
  id: string;
  title: string;
  difficultyTier: string;
}

interface TrainingModule {
  id: string;
  title: string;
  videoSource: 'upload' | 'link';
}

interface Rule {
  id: string;
  scenarioId: string;
  trainingModuleId: string;
  scenario: { id: string; title: string; difficultyTier: string };
  module: { id: string; title: string; videoSource: string } | null;
}

interface Assignment {
  id: string;
  curriculumModuleId: string;
  assignedAt: string;
  completedAt: string | null;
  employee: { name: string; email: string; department: string | null };
}

export default function RoutingPage() {
  return (
    <Guard allow={['client_admin']}>
      <Routing />
    </Guard>
  );
}

function Routing() {
  const tenantId = useActingTenant();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [s, r, a, m] = await Promise.all([
        api.get<Scenario[]>(`/tenants/${tenantId}/scenarios`),
        api.get<Rule[]>(`/tenants/${tenantId}/routing-rules`),
        api.get<Assignment[]>(`/tenants/${tenantId}/training-assignments`),
        api.get<TrainingModule[]>(`/tenants/${tenantId}/training-modules`),
      ]);
      setScenarios(s);
      setRules(r);
      setAssignments(a);
      setModules(m);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRule(scenarioId: string) {
    const moduleId = drafts[scenarioId] || ruleFor(scenarioId)?.trainingModuleId;
    if (!moduleId) {
      setError('Pick a training module for this scenario first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.put(`/tenants/${tenantId}/routing-rules/${scenarioId}`, {
        trainingModuleId: moduleId,
      });
      setOk('Routing rule saved. Future clicks on this scenario assign that module automatically.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearRule(scenarioId: string) {
    setBusy(true);
    try {
      await api.del(`/tenants/${tenantId}/routing-rules/${scenarioId}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: string) {
    setBusy(true);
    try {
      await api.post(`/tenants/${tenantId}/training-assignments/${id}/complete`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ruleFor = (scenarioId: string) => rules.find((r) => r.scenarioId === scenarioId);
  const outstanding = assignments.filter((a) => !a.completedAt).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Training routing</h1>
        <p className="mt-1 text-xs text-slate-500">
          One rule per scenario. An employee who clicks is assigned the mapped module
          automatically — there is no per-employee routing to do.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Scenario to module mapping">
        <Table head={['Scenario', 'Tier', 'Curriculum module', '']}>
          {scenarios.map((s) => {
            const rule = ruleFor(s.id);
            return (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="px-2 py-2">{s.title}</td>
                <td className="px-2 py-2">
                  <Badge>{s.difficultyTier}</Badge>
                </td>
                <td className="px-2 py-2">
                  {modules.length ? (
                    <select
                      className={inputClass}
                      value={drafts[s.id] ?? rule?.trainingModuleId ?? ''}
                      onChange={(e) => setDrafts({ ...drafts, [s.id]: e.target.value })}
                    >
                      <option value="">— select a module —</option>
                      {modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[11px] text-amber-700">
                      No modules yet — add one under Awareness content.
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => saveRule(s.id)} disabled={busy}>
                      Save
                    </Button>
                    {rule && (
                      <Button variant="ghost" onClick={() => clearRule(s.id)} disabled={busy}>
                        Clear
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!scenarios.length && (
            <tr>
              <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                No scenarios yet.
              </td>
            </tr>
          )}
        </Table>
        {scenarios.some((s) => !ruleFor(s.id)) && (
          <p className="mt-3 text-[11px] text-amber-700">
            Scenarios without a rule still track clicks, but no training is assigned.
          </p>
        )}
      </Card>

      <Card
        title="Training assignments"
        subtitle={`${assignments.length} total · ${outstanding} outstanding`}
      >
        <div className="max-h-[24rem] overflow-y-auto">
          <Table head={['Employee', 'Department', 'Module', 'Assigned', 'Status', '']}>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="px-2 py-2">{a.employee.name}</td>
                <td className="px-2 py-2 text-slate-500">{a.employee.department ?? '—'}</td>
                <td className="px-2 py-2">{a.curriculumModuleId}</td>
                <td className="px-2 py-2">{new Date(a.assignedAt).toLocaleDateString()}</td>
                <td className="px-2 py-2">
                  <Badge>{a.completedAt ? 'completed' : 'active'}</Badge>
                </td>
                <td className="px-2 py-2 text-right">
                  {!a.completedAt && (
                    <Button variant="ghost" onClick={() => complete(a.id)} disabled={busy}>
                      Mark complete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!assignments.length && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                  No training assigned yet — nobody has clicked a simulation.
                </td>
              </tr>
            )}
          </Table>
        </div>
      </Card>
    </div>
  );
}
