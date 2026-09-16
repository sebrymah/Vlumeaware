'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, Field, Notice, Table, inputClass } from '@/components/ui';

interface Scenario {
  id: string;
  title: string;
  difficultyTier: string;
  approvedAt: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  campaignScenarios: Array<{ scenario: { id: string; title: string } }>;
}

export default function AdminCampaignsPage() {
  return (
    <Guard allow={['client_admin']}>
      <Campaigns />
    </Guard>
  );
}

function Campaigns() {
  const tenantId = useActingTenant();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [scheduledSendAt, setScheduledSendAt] = useState('');
  const [sendWindowMinutes, setSendWindowMinutes] = useState('0');
  const [recurrenceDays, setRecurrenceDays] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [c, s] = await Promise.all([
        api.get<Campaign[]>(`/tenants/${tenantId}/campaigns`),
        api.get<Scenario[]>(`/tenants/${tenantId}/scenarios`),
      ]);
      setCampaigns(c);
      setScenarios(s);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(campaignId: string, action: 'launch' | 'pause' | 'resume' | 'kill') {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.post<Record<string, unknown>>(
        `/tenants/${tenantId}/campaigns/${campaignId}/${action}`,
      );
      setOk(
        action === 'launch' || action === 'resume'
          ? `Campaign ${action}ed — ${res.queued} sends queued.`
          : action === 'kill'
            ? `Campaign halted. ${res.removedJobs} queued sends removed.`
            : 'Campaign paused.',
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tenants/${tenantId}/campaigns`, {
        name,
        scenarioIds: selected,
        scheduledSendAt: scheduledSendAt ? new Date(scheduledSendAt).toISOString() : undefined,
        sendWindowMinutes: Number(sendWindowMinutes) || 0,
        recurrenceDays: recurrenceDays ? Number(recurrenceDays) : undefined,
      });
      setName('');
      setSelected([]);
      setScheduledSendAt('');
      setSendWindowMinutes('0');
      setRecurrenceDays('');
      setOk(
        scheduledSendAt
          ? 'Campaign scheduled. It will auto-launch at the set time.'
          : 'Campaign created as a draft. Launch it when you are ready to send.',
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const approved = scenarios.filter((s) => s.approvedAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Campaigns</h1>
        <p className="mt-1 text-xs text-slate-500">
          Authorized simulations against your employee roster. Every campaign can be halted in one
          action.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Your campaigns">
        <Table head={['Campaign', 'Scenarios', 'Status', 'Created', 'Actions']}>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-slate-800/60">
              <td className="px-2 py-2">
                <Link href={`/client/campaigns/${c.id}`} className="text-emerald-400 hover:underline">
                  {c.name}
                </Link>
              </td>
              <td className="px-2 py-2 text-slate-400">
                {c.campaignScenarios.map((cs) => cs.scenario.title).join(', ') || '—'}
              </td>
              <td className="px-2 py-2">
                <Badge>{c.status}</Badge>
              </td>
              <td className="px-2 py-2">{new Date(c.createdAt).toLocaleDateString()}</td>
              <td className="px-2 py-2">
                <div className="flex justify-end gap-2">
                  {c.status === 'draft' && (
                    <Button onClick={() => act(c.id, 'launch')} disabled={busy}>
                      Launch
                    </Button>
                  )}
                  {c.status === 'active' && (
                    <>
                      <Button variant="ghost" onClick={() => act(c.id, 'pause')} disabled={busy}>
                        Pause
                      </Button>
                      <Button variant="danger" onClick={() => act(c.id, 'kill')} disabled={busy}>
                        Kill
                      </Button>
                    </>
                  )}
                  {c.status === 'paused' && (
                    <>
                      <Button onClick={() => act(c.id, 'resume')} disabled={busy}>
                        Resume
                      </Button>
                      <Button variant="danger" onClick={() => act(c.id, 'kill')} disabled={busy}>
                        Kill
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!campaigns.length && (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                No campaigns yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      <Card
        title="Create a campaign"
        subtitle="Only approved scenarios can be attached. Vlumetech approves scenarios on your behalf."
      >
        {!approved.length ? (
          <Notice kind="info">
            No approved scenarios yet. Generate and save one under Scenarios, then ask Vlumetech to
            approve it.
          </Notice>
        ) : (
          <form onSubmit={create} className="space-y-4">
            <div className="w-80">
              <Field label="Campaign name">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q4 2026 baseline"
                  required
                  minLength={2}
                />
              </Field>
            </div>
            <Field label="Scenarios">
              <div className="space-y-1">
                {approved.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, s.id]
                            : selected.filter((id) => id !== s.id),
                        )
                      }
                    />
                    {s.title}
                    <Badge>{s.difficultyTier}</Badge>
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Schedule send (optional)" hint="Leave blank to launch manually.">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={scheduledSendAt}
                  onChange={(e) => setScheduledSendAt(e.target.value)}
                />
              </Field>
              <Field label="Drip window (minutes)" hint="Spread sends randomly; 0 = all at once.">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={sendWindowMinutes}
                  onChange={(e) => setSendWindowMinutes(e.target.value)}
                />
              </Field>
              <Field label="Repeat every (days)" hint="e.g. 90 for quarterly. Blank = one-off.">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={recurrenceDays}
                  onChange={(e) => setRecurrenceDays(e.target.value)}
                  placeholder="—"
                />
              </Field>
            </div>
            <Button type="submit" disabled={busy || !selected.length || name.trim().length < 2}>
              Create draft campaign
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
