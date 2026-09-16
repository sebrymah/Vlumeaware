'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard } from '@/components/guard';
import { Badge, Button, Card, Field, Notice, Stat, Table, inputClass, pct } from '@/components/ui';

interface OverviewRow {
  tenantId: string;
  name: string;
  status: string;
  agreementSigned: boolean;
  campaigns: number;
  sends: number;
  clickRate: number;
  reportRate: number;
}

export default function SuperAdminPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <Console />
    </Guard>
  );
}

interface PendingSignup {
  id: string;
  name: string;
  createdAt: string;
  trialEndsAt: string | null;
  seatLimit: number | null;
  _count: { tenantUsers: number; employees: number };
}

function Console() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [pending, setPending] = useState<PendingSignup[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [overview, signups] = await Promise.all([
        api.get<OverviewRow[]>('/tenants/overview'),
        api.get<PendingSignup[]>('/tenants/pending-signups'),
      ]);
      setRows(overview);
      setPending(signups);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/tenants', { name });
      setName('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const totals = rows.reduce(
    (acc, r) => ({
      sends: acc.sends + r.sends,
      campaigns: acc.campaigns + r.campaigns,
      pending: acc.pending + (r.agreementSigned ? 0 : 1),
    }),
    { sends: 0, campaigns: 0, pending: 0 },
  );

  async function approve(tenantId: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.post(`/tenants/${tenantId}/approve`, {});
      setOk('Client approved — full access unlocked.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Client portfolio</h1>
        <p className="mt-1 text-xs text-slate-500">
          Vlumetech internal console. Onboarding is white-glove; clients cannot self-register.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Clients" value={String(rows.length)} />
        <Stat label="Campaigns" value={String(totals.campaigns)} />
        <Stat label="Simulations sent" value={String(totals.sends)} />
        <Stat
          label="Agreements pending"
          value={String(totals.pending)}
          hint={totals.pending ? 'campaigns blocked until signed' : 'all clients cleared'}
        />
      </div>

      {ok && <Notice kind="ok">{ok}</Notice>}

      {pending.length > 0 && (
        <Card
          title={`Pending signups (${pending.length})`}
          subtitle="Self-serve free-trial clients awaiting approval. Approving unlocks live campaigns."
        >
          <Table head={['Client', 'Signed up', 'Trial ends', 'Employees', 'Seats', '']}>
            {pending.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="px-2 py-2">{p.name}</td>
                <td className="px-2 py-2 text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                <td className="px-2 py-2 text-slate-500">
                  {p.trialEndsAt ? new Date(p.trialEndsAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-2 py-2">{p._count.employees}</td>
                <td className="px-2 py-2">{p.seatLimit ?? '—'}</td>
                <td className="px-2 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <a
                      href={`/super-admin/${p.id}`}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-slate-400"
                    >
                      Review
                    </a>
                    <Button onClick={() => approve(p.id)} disabled={busy}>
                      Approve
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title="Clients" subtitle="Click a client to manage its agreement, users and campaigns.">
        <Table head={['Client', 'Status', 'NDPA agreement', 'Campaigns', 'Sent', 'Click rate', 'Report rate']}>
          {rows.map((r) => (
            <tr key={r.tenantId} className="border-b border-slate-100">
              <td className="px-2 py-2">
                <Link href={`/super-admin/${r.tenantId}`} className="text-brand-600 hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="px-2 py-2">
                <Badge>{r.status}</Badge>
              </td>
              <td className="px-2 py-2">
                <Badge>{r.agreementSigned ? 'yes' : 'no'}</Badge>
              </td>
              <td className="px-2 py-2">{r.campaigns}</td>
              <td className="px-2 py-2">{r.sends}</td>
              <td className="px-2 py-2">{pct(r.clickRate)}</td>
              <td className="px-2 py-2">{pct(r.reportRate)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="px-2 py-6 text-center text-slate-500">
                No clients onboarded yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      <Card title="Onboard a client">
        <form onSubmit={createTenant} className="flex items-end gap-3">
          <div className="w-72">
            <Field label="Registered company name">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kaduna Foods Ltd"
                required
                minLength={2}
              />
            </Field>
          </div>
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            {busy ? 'Creating…' : 'Create client'}
          </Button>
        </form>
        <p className="mt-3 text-[11px] text-slate-500">
          The client is created in a campaign-blocked state. Upload the signed NDPA authorization
          agreement on its page to release campaign creation.
        </p>
      </Card>
    </div>
  );
}
