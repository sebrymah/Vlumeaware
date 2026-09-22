'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Button, Card, EmptyState, Field, Notice, inputClass } from '@/components/ui';

interface DnsRecord {
  record?: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
}

interface SendingDomain {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  dnsRecords: DnsRecord[] | null;
  verifiedAt: string | null;
  createdAt: string;
}

export default function SendingDomainsPage() {
  return (
    <Guard allow={['client_admin']}>
      <SendingDomains />
    </Guard>
  );
}

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-mono text-[12px] text-slate-800 hover:border-slate-300"
      title="Click to copy"
    >
      <span className="truncate">{value}</span>
      <span className="ml-auto shrink-0 text-[10px] font-sans font-semibold text-brand-600">
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}

function StatusPill({ status }: { status: SendingDomain['status'] }) {
  const map = {
    verified: 'bg-brand-50 text-brand-700 ring-brand-100',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    failed: 'bg-red-50 text-red-700 ring-red-200',
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${map[status]}`}>
      {status}
    </span>
  );
}

function SendingDomains() {
  const tenantId = useActingTenant();
  const [list, setList] = useState<SendingDomain[]>([]);
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      // The list endpoint refreshes pending domains from the provider, so
      // opening the page reflects DNS that has propagated since last time.
      setList(await api.get<SendingDomain[]>(`/tenants/${tenantId}/sending-domains`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy('add');
    setError(null);
    setOk(null);
    try {
      await api.post(`/tenants/${tenantId}/sending-domains`, { domain });
      setOk('Domain added. Publish the DNS records below, then check verification.');
      setDomain('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refresh(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.post(`/tenants/${tenantId}/sending-domains/${id}/refresh`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.del(`/tenants/${tenantId}/sending-domains/${id}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const verifiedCount = list.filter((d) => d.status === 'verified').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Sending domains</h1>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          The domains your simulated phishing appears to come <strong>from</strong>. Register a
          domain you own, publish the DNS records we give you, and once it verifies you can choose
          it per campaign. This is separate from <strong>Domains</strong>, which controls who you
          may send <strong>to</strong>.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Add a sending domain">
        <form onSubmit={add} className="flex items-end gap-3">
          <Field
            label="Domain"
            hint="A domain you own, e.g. acme-security.com. A lookalike or a subdomain of your own is common."
          >
            <input
              className={inputClass}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acme-security.com"
              required
            />
          </Field>
          <Button type="submit" disabled={busy === 'add'}>
            {busy === 'add' ? 'Adding…' : 'Add domain'}
          </Button>
        </form>
      </Card>

      <Card title={`Your sending domains (${verifiedCount}/${list.length} verified)`}>
        {list.length === 0 ? (
          <EmptyState
            title="No sending domains yet"
            hint="Add one above to send simulations from your own domain."
          />
        ) : (
          <div className="space-y-5">
            {list.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm font-medium text-slate-900">{d.domain}</span>
                  <StatusPill status={d.status} />
                  {d.verifiedAt && (
                    <span className="text-[11px] text-slate-400">
                      verified {new Date(d.verifiedAt).toLocaleDateString()}
                    </span>
                  )}
                  <div className="ml-auto flex gap-2">
                    {d.status !== 'verified' && (
                      <Button variant="ghost" onClick={() => refresh(d.id)} disabled={busy === d.id}>
                        {busy === d.id ? 'Checking…' : 'Check verification'}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => remove(d.id)} disabled={busy === d.id}>
                      Remove
                    </Button>
                  </div>
                </div>

                {d.status !== 'verified' && d.dnsRecords && d.dnsRecords.length > 0 && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs leading-relaxed text-slate-600">
                      Add these to your DNS, then click <strong>Check verification</strong>. It can
                      take a while for DNS to propagate — the page also re-checks whenever you open
                      it.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                            <th className="py-1 pr-3">Type</th>
                            <th className="py-1 pr-3">Name / Host</th>
                            <th className="py-1">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.dnsRecords.map((r, i) => (
                            <tr key={i} className="border-b border-slate-100 align-top">
                              <td className="py-2 pr-3 font-mono text-slate-500">
                                {r.type}
                                {r.priority != null ? ` (prio ${r.priority})` : ''}
                              </td>
                              <td className="w-1/3 py-2 pr-3">
                                <Copyable value={r.name} />
                              </td>
                              <td className="py-2">
                                <Copyable value={r.value} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {d.status === 'failed' && (
                  <p className="mt-2 text-xs text-red-700">
                    Verification failed. Check the records match exactly, then check again. Remove
                    and re-add if the records need regenerating.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
