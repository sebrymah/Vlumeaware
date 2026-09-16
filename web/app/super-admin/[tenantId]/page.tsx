'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Guard } from '@/components/guard';
import { Badge, Button, Card, Field, Notice, Table, inputClass } from '@/components/ui';

interface Tenant {
  id: string;
  name: string;
  status: string;
  ndpaAgreementSignedAt: string | null;
  ndpaAgreementDocUrl: string | null;
  brandPrimaryColor: string | null;
  sendingDomain: string | null;
  allowlistConfirmedAt: string | null;
  digestEmail: string | null;
  digestEnabled: boolean;
  licenseTier: string | null;
  seatLimit: number | null;
}

interface TenantUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export default function TenantPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <TenantDetail />
    </Guard>
  );
}

function TenantDetail() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [signedAt, setSignedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [sendingDomain, setSendingDomain] = useState('');
  const [digestEmail, setDigestEmail] = useState('');
  const [licenseTier, setLicenseTier] = useState('');
  const [seatLimit, setSeatLimit] = useState('');
  const [seatsUsed, setSeatsUsed] = useState<number | null>(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'client_admin' });

  const load = useCallback(async () => {
    try {
      const [t, u, c] = await Promise.all([
        api.get<Tenant>(`/tenants/${tenantId}`),
        api.get<TenantUser[]>(`/tenants/${tenantId}/users`),
        api.get<Campaign[]>(`/tenants/${tenantId}/campaigns`),
      ]);
      setTenant(t);
      setSendingDomain(t.sendingDomain ?? '');
      setDigestEmail(t.digestEmail ?? '');
      setLicenseTier(t.licenseTier ?? '');
      setSeatLimit(t.seatLimit != null ? String(t.seatLimit) : '');
      try {
        const usage = await api.get<{ used: number }>(`/tenants/${tenantId}/seats`);
        setSeatsUsed(usage.used);
      } catch {
        setSeatsUsed(null);
      }
      setUsers(u);
      setCampaigns(c);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadAgreement(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('document', file);
      form.append('signedAt', new Date(signedAt).toISOString());
      await api.upload(`/tenants/${tenantId}/agreement`, form);
      setOk('Agreement recorded. Campaign creation is now unblocked for this client.');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tenants/${tenantId}/users`, newUser);
      setNewUser({ email: '', password: '', role: 'client_admin' });
      setOk('Account created.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDeliverability(allowlistConfirmed?: boolean) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.patch(`/tenants/${tenantId}/deliverability`, {
        sendingDomain: sendingDomain || undefined,
        allowlistConfirmed,
      });
      setOk('Deliverability settings saved.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDigest(digestEnabled: boolean) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.patch(`/tenants/${tenantId}/digest`, {
        digestEnabled,
        digestEmail: digestEmail || undefined,
      });
      setOk(digestEnabled ? 'Weekly digest enabled.' : 'Weekly digest disabled.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLicense() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.patch(`/tenants/${tenantId}/license`, {
        licenseTier: licenseTier || null,
        seatLimit: seatLimit === '' ? null : Number(seatLimit),
      });
      setOk('License updated.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await api.patch(`/tenants/${tenantId}/status`, { status });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function kill(campaignId: string) {
    setBusy(true);
    try {
      const res = await api.post<{ removedJobs: number }>(
        `/tenants/${tenantId}/campaigns/${campaignId}/kill`,
      );
      setOk(`Campaign halted. ${res.removedJobs} queued sends removed.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!tenant) {
    return error ? <Notice kind="error">{error}</Notice> : <p className="text-sm text-slate-500">Loading…</p>;
  }

  const signed = tenant.ndpaAgreementSignedAt !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">{tenant.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Badge>{tenant.status}</Badge>
            <span>NDPA agreement:</span>
            <Badge>{signed ? 'yes' : 'no'}</Badge>
            {signed && <span>signed {new Date(tenant.ndpaAgreementSignedAt!).toLocaleDateString()}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {tenant.status === 'active' ? (
            <Button variant="ghost" onClick={() => setStatus('suspended')} disabled={busy}>
              Suspend
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setStatus('active')} disabled={busy}>
              Reactivate
            </Button>
          )}
          <Button variant="danger" onClick={() => setStatus('offboarded')} disabled={busy}>
            Offboard
          </Button>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      {!signed && (
        <Notice kind="error">
          Campaign creation is blocked for this client until a signed NDPA authorization agreement
          is on file. The server enforces this, not just the interface.
        </Notice>
      )}

      <Card
        title="NDPA authorization agreement"
        subtitle="The signed document that makes simulations against this client's employees lawful."
      >
        <form onSubmit={uploadAgreement} className="flex flex-wrap items-end gap-3">
          <Field label="Signed document" hint="PDF or scan, up to 10 MB">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="text-xs text-slate-300"
              required
            />
          </Field>
          <div className="w-40">
            <Field label="Date signed">
              <input
                className={inputClass}
                type="date"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
                required
              />
            </Field>
          </div>
          <Button type="submit" disabled={busy}>
            {signed ? 'Replace agreement' : 'Record agreement'}
          </Button>
        </form>
        {tenant.ndpaAgreementDocUrl && (
          <p className="mt-3 break-all text-[11px] text-slate-500">
            Stored at {tenant.ndpaAgreementDocUrl}
          </p>
        )}
      </Card>

      <Card
        title="Deliverability & digest"
        subtitle="Sending domain, gateway allow-list confirmation, and the weekly email summary."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sending / tracking domain">
              <input
                className={inputClass}
                value={sendingDomain}
                onChange={(e) => setSendingDomain(e.target.value)}
                placeholder="vlumeaware-trk.io"
              />
            </Field>
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => saveDeliverability()} disabled={busy}>
                Save domain
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <span>
              Client IT allow-list:{' '}
              {tenant.allowlistConfirmedAt ? (
                <span className="text-emerald-300">confirmed</span>
              ) : (
                <span className="text-amber-300">not confirmed</span>
              )}
            </span>
            {tenant.allowlistConfirmedAt ? (
              <Button variant="ghost" onClick={() => saveDeliverability(false)} disabled={busy}>
                Unconfirm
              </Button>
            ) : (
              <Button onClick={() => saveDeliverability(true)} disabled={busy}>
                Mark IT-confirmed
              </Button>
            )}
          </div>
          <div className="grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
            <Field label="Digest email">
              <input
                className={inputClass}
                type="email"
                value={digestEmail}
                onChange={(e) => setDigestEmail(e.target.value)}
                placeholder="security@client.test"
              />
            </Field>
            <div className="flex items-end gap-2">
              {tenant.digestEnabled ? (
                <Button variant="ghost" onClick={() => saveDigest(false)} disabled={busy}>
                  Disable weekly digest
                </Button>
              ) : (
                <Button onClick={() => saveDigest(true)} disabled={busy || !digestEmail}>
                  Enable weekly digest
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="License & seats"
        subtitle="Set the client's tier and how many employees (seats) they may add."
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="License tier">
              <input
                className={inputClass}
                value={licenseTier}
                onChange={(e) => setLicenseTier(e.target.value)}
                placeholder="Starter / Growth / Enterprise"
              />
            </Field>
            <Field label="Seat limit" hint="Blank = unlimited.">
              <input
                className={inputClass}
                type="number"
                min={seatsUsed ?? 0}
                value={seatLimit}
                onChange={(e) => setSeatLimit(e.target.value)}
                placeholder="—"
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={saveLicense} disabled={busy}>
                Save license
              </Button>
            </div>
          </div>
          {seatsUsed !== null && (
            <p className="text-xs text-slate-400">
              Currently using <span className="font-semibold text-slate-200">{seatsUsed}</span>{' '}
              {tenant.seatLimit != null ? `of ${tenant.seatLimit} seats` : 'seats (unlimited)'}.
            </p>
          )}
        </div>
      </Card>


      <Card title="Client accounts">
        <Table head={['Email', 'Role', 'Created']}>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-slate-800/60">
              <td className="px-2 py-2">{u.email}</td>
              <td className="px-2 py-2">
                <Badge>{u.role}</Badge>
              </td>
              <td className="px-2 py-2">{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {!users.length && (
            <tr>
              <td colSpan={3} className="px-2 py-4 text-center text-slate-500">
                No client accounts yet.
              </td>
            </tr>
          )}
        </Table>

        <form onSubmit={addUser} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-800 pt-4">
          <div className="w-56">
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Initial password" hint="Minimum 12 characters">
              <input
                className={inputClass}
                type="password"
                minLength={12}
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Role">
              <select
                className={inputClass}
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="client_admin">client_admin</option>
                <option value="client_viewer">client_viewer</option>
              </select>
            </Field>
          </div>
          <Button type="submit" disabled={busy}>
            Create account
          </Button>
        </form>
      </Card>

      <Card title="Campaigns" subtitle="Vlumetech can halt any campaign in any tenant.">
        <Table head={['Campaign', 'Status', 'Created', '']}>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-slate-800/60">
              <td className="px-2 py-2">{c.name}</td>
              <td className="px-2 py-2">
                <Badge>{c.status}</Badge>
              </td>
              <td className="px-2 py-2">{new Date(c.createdAt).toLocaleString()}</td>
              <td className="px-2 py-2 text-right">
                {(c.status === 'active' || c.status === 'paused') && (
                  <Button variant="danger" onClick={() => kill(c.id)} disabled={busy}>
                    Kill
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {!campaigns.length && (
            <tr>
              <td colSpan={4} className="px-2 py-4 text-center text-slate-500">
                No campaigns for this client.
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
