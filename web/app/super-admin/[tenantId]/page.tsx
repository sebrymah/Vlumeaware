'use client';

import Link from 'next/link';
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
  agreementMethod: string | null;
  agreementVersion: string | null;
  agreementAcceptedBy: string | null;
  agreementAcceptedIp: string | null;
  brandPrimaryColor: string | null;
  sendingDomain: string | null;
  allowlistConfirmedAt: string | null;
  digestEmail: string | null;
  digestEnabled: boolean;
  lastDigestSentAt: string | null;
  licenseTier: string | null;
  seatLimit: number | null;
}

interface LicenseKey {
  id: string;
  displayHint: string;
  licenseTier: string;
  seatLimit: number | null;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
  revokedAt: string | null;
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
  const [confirmName, setConfirmName] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [keyValidDays, setKeyValidDays] = useState('30');
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [deleted, setDeleted] = useState<{
    name: string;
    rows: number;
    filesDeleted: number;
    filesFailed: string[];
  } | null>(null);

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
      const [t, u, c, k] = await Promise.all([
        api.get<Tenant>(`/tenants/${tenantId}`),
        api.get<TenantUser[]>(`/tenants/${tenantId}/users`),
        api.get<Campaign[]>(`/tenants/${tenantId}/campaigns`),
        api.get<LicenseKey[]>(`/tenants/${tenantId}/license/keys`),
      ]);
      setKeys(k);
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

  async function issueKey() {
    setBusy(true);
    setError(null);
    setIssuedKey(null);
    setKeyCopied(false);
    try {
      const res = await api.post<{ key: string }>(`/tenants/${tenantId}/license/keys`, {
        licenseTier: licenseTier || 'Starter',
        seatLimit: seatLimit ? Number(seatLimit) : undefined,
        validDays: Number(keyValidDays) || 30,
      });
      // Shown once and never retrievable, so it is held in state rather than
      // refetched with the list below.
      setIssuedKey(res.key);
      setKeys(await api.get<LicenseKey[]>(`/tenants/${tenantId}/license/keys`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/tenants/${tenantId}/license/keys/${id}`);
      setKeys(await api.get<LicenseKey[]>(`/tenants/${tenantId}/license/keys`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTenant() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.del<{ name: string; rows: number; filesDeleted: number; filesFailed: string[] }>(
        `/tenants/${tenantId}`,
        { confirmName },
      );
      // The tenant is gone, so there is nothing left to reload. Show the
      // outcome here rather than bouncing to a list that cannot explain it.
      setDeleted(res);
    } catch (err) {
      setError((err as Error).message);
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

  // Checked before the loading guard: once deleted there is no tenant to load,
  // so the ordinary "Loading…" state would be wrong and permanent.
  if (deleted) {
    return (
      <div className="space-y-4">
        <Notice kind="ok">
          Deleted <strong>{deleted.name}</strong>. {deleted.rows} rows and {deleted.filesDeleted}{' '}
          stored file(s) removed. The name is free to onboard again.
        </Notice>
        {deleted.filesFailed.length > 0 && (
          <Notice kind="error">
            {deleted.filesFailed.length} stored file(s) could not be deleted and are still in the
            bucket. The client rows are gone; these need removing by hand. See the server log.
          </Notice>
        )}
        <Link href="/super-admin" className="text-sm font-medium text-brand-700 underline">
          Back to clients
        </Link>
      </div>
    );
  }

  if (!tenant) {
    return error ? <Notice kind="error">{error}</Notice> : <p className="text-sm text-slate-500">Loading…</p>;
  }

  const signed = tenant.ndpaAgreementSignedAt !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{tenant.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Badge>{tenant.status}</Badge>
            <span>NDPA agreement:</span>
            <Badge>{signed ? 'yes' : 'no'}</Badge>
            {signed && (
              <span>
                {tenant.agreementMethod === 'click_through' ? 'accepted online' : 'signed'}{' '}
                {new Date(tenant.ndpaAgreementSignedAt!).toLocaleDateString()}
              </span>
            )}
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
          Campaign creation is blocked for this client until the authorization agreement
          is on file. The server enforces this, not just the interface.
        </Notice>
      )}

      <Card
        title="Authorization agreement"
        subtitle="What makes simulations against this client's employees lawful. Accepted online at signup, or filed here as a countersigned document."
      >
        {tenant.agreementMethod === 'click_through' && (
          <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
            <p className="font-semibold">Accepted online at signup — nothing to upload.</p>
            <p className="mt-1">
              {tenant.agreementAcceptedBy ?? 'unknown user'} accepted version{' '}
              {tenant.agreementVersion ?? 'unrecorded'} on{' '}
              {new Date(tenant.ndpaAgreementSignedAt!).toLocaleString()}
              {tenant.agreementAcceptedIp ? ` from ${tenant.agreementAcceptedIp}` : ''}.
            </p>
            <p className="mt-1 text-brand-800">
              Use the form below only if this client also needs a countersigned document on file.
            </p>
          </div>
        )}
        <form onSubmit={uploadAgreement} className="flex flex-wrap items-end gap-3">
          <Field label="Signed document" hint="PDF or scan, up to 10 MB">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="text-xs text-slate-600"
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
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>
              Client IT allow-list:{' '}
              {tenant.allowlistConfirmedAt ? (
                <span className="text-brand-700">confirmed</span>
              ) : (
                <span className="text-amber-700">not confirmed</span>
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
          <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
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
          <div className="text-xs text-slate-600">
            {/* Without this there is no way to tell a working digest from a
                silently failing one until the client asks where it is. */}
            {tenant.digestEnabled ? (
              tenant.lastDigestSentAt ? (
                <>Last digest sent {new Date(tenant.lastDigestSentAt).toLocaleString()}. Sends weekly.</>
              ) : (
                <span className="text-amber-700">
                  Enabled, but none sent yet. The first goes out within the hour.
                </span>
              )
            ) : (
              <>Off. When enabled, one digest is sent within the hour and weekly after that.</>
            )}
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
            <p className="text-xs text-slate-500">
              Currently using <span className="font-semibold text-slate-700">{seatsUsed}</span>{' '}
              {tenant.seatLimit != null ? `of ${tenant.seatLimit} seats` : 'seats (unlimited)'}.
            </p>
          )}

          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div>
              <p className="text-[13px] font-semibold text-slate-800">License key</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Issues a key for the tier and seats above. Send it to the client admin — redeeming
                it activates their account, so they go live when they are ready rather than when
                you happen to click Save.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Field label="Valid for (days)">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={365}
                  value={keyValidDays}
                  onChange={(e) => setKeyValidDays(e.target.value)}
                />
              </Field>
              <Button onClick={issueKey} disabled={busy}>
                Generate license key
              </Button>
            </div>

            {issuedKey && (
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
                <p className="text-xs font-semibold text-brand-900">
                  Copy this now — it is shown once and cannot be retrieved.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-white px-2.5 py-1.5 font-mono text-sm tracking-wider text-slate-900 ring-1 ring-inset ring-brand-200">
                    {issuedKey}
                  </code>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(issuedKey);
                        setKeyCopied(true);
                      } catch {
                        /* clipboard unavailable */
                      }
                    }}
                  >
                    {keyCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-brand-800">
                  Only the hash is stored. If it is lost, revoke it and issue another.
                </p>
              </div>
            )}

            {keys.length > 0 && (
              <Table head={['Key', 'Tier', 'Seats', 'Expires', 'Status', '']}>
                {keys.map((k) => {
                  const expired = !k.redeemedAt && new Date(k.expiresAt).getTime() < Date.now();
                  const status = k.redeemedAt
                    ? `redeemed ${new Date(k.redeemedAt).toLocaleDateString()}`
                    : k.revokedAt
                      ? 'revoked'
                      : expired
                        ? 'expired'
                        : 'unused';
                  return (
                    <tr key={k.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2 font-mono text-xs text-slate-500">…{k.displayHint}</td>
                      <td className="px-2 py-2">{k.licenseTier}</td>
                      <td className="px-2 py-2">{k.seatLimit ?? '—'}</td>
                      <td className="px-2 py-2">{new Date(k.expiresAt).toLocaleDateString()}</td>
                      <td className="px-2 py-2">
                        <span
                          className={
                            k.redeemedAt
                              ? 'text-brand-700'
                              : k.revokedAt || expired
                                ? 'text-slate-400'
                                : 'text-amber-700'
                          }
                        >
                          {status}
                        </span>
                        {k.redeemedBy && (
                          <span className="block text-[11px] text-slate-400">{k.redeemedBy}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {!k.redeemedAt && !k.revokedAt && (
                          <Button variant="ghost" onClick={() => revokeKey(k.id)} disabled={busy}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Delete this client"
        subtitle="Removes the client and everything belonging to them. There is no undo."
      >
        {tenant.status === 'active' ? (
          <p className="text-xs text-slate-500">
            An active client cannot be deleted. Suspend or offboard it first — the server enforces
            this, not just this page.
          </p>
        ) : !showDelete ? (
          <div className="flex items-center gap-3">
            <Button variant="danger" onClick={() => setShowDelete(true)}>
              Delete permanently
            </Button>
            <span className="text-xs text-slate-500">
              Frees the name so the same company can be onboarded again.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800">
              <p className="font-semibold">This deletes everything, permanently.</p>
              <p className="mt-1">
                Employees, campaigns, sends, scenarios, training modules, quizzes, certificates,
                verified domains and console users — plus the videos, logos and signed agreements
                in storage. Issued certificates stop verifying. Only the audit log survives.
              </p>
            </div>
            <Field label={`Type the client's name to confirm: ${tenant.name}`}>
              <input
                className={inputClass}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={tenant.name}
                autoComplete="off"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={deleteTenant}
                disabled={busy || confirmName.trim() !== tenant.name.trim()}
              >
                {busy ? 'Deleting…' : 'Delete this client forever'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowDelete(false);
                  setConfirmName('');
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>


      <Card title="Client accounts">
        <Table head={['Email', 'Role', 'Created']}>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-slate-100">
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

        <form onSubmit={addUser} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
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
            <tr key={c.id} className="border-b border-slate-100">
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
