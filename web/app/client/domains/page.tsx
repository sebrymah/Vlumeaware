'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, EmptyState, Field, Notice, inputClass } from '@/components/ui';
import { Icon } from '@/components/icons';

interface DnsRecord {
  host: string;
  type: string;
  value: string;
}
interface Allowlist {
  ips: string[];
  sendingDomain: string | null;
  trackingDomain: string | null;
  configured: boolean;
  confirmedAt: string | null;
}

interface Domain {
  id: string;
  domain: string;
  status: 'pending' | 'verified';
  verifiedAt: string | null;
  dnsRecord: DnsRecord;
}

export default function DomainsPage() {
  return (
    <Guard allow={['client_admin']}>
      <Domains />
    </Guard>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
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
        className="mt-0.5 flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-mono text-[12px] text-slate-800 hover:border-slate-300"
        title="Click to copy"
      >
        <span className="truncate">{value}</span>
        <span className="ml-auto shrink-0 text-[10px] font-sans font-semibold text-brand-600">
          {copied ? 'copied' : 'copy'}
        </span>
      </button>
    </div>
  );
}

function Domains() {
  const tenantId = useActingTenant();
  const [list, setList] = useState<Domain[]>([]);
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [allowlist, setAllowlist] = useState<Allowlist | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [domains, guidance] = await Promise.all([
        api.get<Domain[]>(`/tenants/${tenantId}/domains`),
        api.get<Allowlist>(`/tenants/${tenantId}/allowlist`),
      ]);
      setList(domains);
      setAllowlist(guidance);
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
      await api.post(`/tenants/${tenantId}/domains`, { domain });
      setDomain('');
      setOk('Domain added. Add the TXT record below at your DNS provider, then click Verify.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verify(d: Domain) {
    setBusy(d.id);
    setError(null);
    setOk(null);
    try {
      const res = await api.post<Domain>(`/tenants/${tenantId}/domains/${d.id}/verify`);
      if (res.status === 'verified') setOk(`${d.domain} is verified. You can now onboard ${d.domain} employees.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(d: Domain) {
    if (!confirm(`Remove ${d.domain}? Employees on this domain can no longer be added or emailed.`)) return;
    setBusy(d.id);
    try {
      await api.del(`/tenants/${tenantId}/domains/${d.id}`);
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
        <h1 className="text-lg font-semibold text-slate-900">Domains</h1>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          Prove you own a domain before onboarding its people. You can only add employees — and only
          send simulations — to addresses on a <strong>verified</strong> domain, so no one outside your
          organisation is ever phished. Add as many domains as you own.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card
        title="Mail gateway allow-list"
        subtitle="Give these to your IT team. Without them your own filters quarantine the simulation."
      >
        {!allowlist?.configured ? (
          <p className="text-xs text-slate-500">
            Vlumetech has not published the allow-list details for this deployment yet. Contact
            your account manager before scheduling a campaign.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-600">
              A simulated phish has to reach the inbox to measure anything. If your gateway
              quarantines it, the campaign reports a clean result that is not real. Allow the
              following, and <strong>only</strong> for the sending domain below — not globally.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {allowlist.sendingDomain && (
                <Copyable label="Sending domain" value={allowlist.sendingDomain} />
              )}
              {allowlist.trackingDomain && (
                <Copyable label="Link / tracking domain" value={allowlist.trackingDomain} />
              )}
              {allowlist.ips.length > 0 && (
                <Copyable label="Sending IPs" value={allowlist.ips.join(', ')} />
              )}
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-700">Where to put them</p>
              <p className="mt-1">
                <strong>Microsoft 365:</strong> Security portal → Policies → Advanced delivery →
                Phishing simulation. It asks for the sending domain and the IP together; both are
                required. Add the link domain under third-party phishing simulation URLs.
              </p>
              <p className="mt-1">
                <strong>Google Workspace:</strong> Admin console → Apps → Gmail → Spam, phishing
                and malware. Add the IPs to an inbound gateway or email allow-list, and skip
                spam filtering for those senders.
              </p>
              <p className="mt-2 text-slate-500">
                Use the phishing-simulation setting rather than a blanket allow rule, so only this
                traffic is exempted and your real protection is untouched.
              </p>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 pt-3 text-xs">
              <span className="text-slate-600">Status:</span>
              {allowlist.confirmedAt ? (
                <span className="text-brand-700">
                  confirmed {new Date(allowlist.confirmedAt).toLocaleDateString()}
                </span>
              ) : (
                <>
                  <span className="text-amber-700">not confirmed</span>
                  {/* The client cannot tick this themselves: it is one of the
                      six preflight gates, and a self-attested gate is no gate. */}
                  <span className="text-slate-500">
                    Tell your account manager once IT has applied it, and they will record it.
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="Add a domain">
        <form onSubmit={add} className="flex items-end gap-3">
          <Field label="Domain" hint="Just the domain — e.g. acme.com (not an email address).">
            <input
              className={inputClass}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acme.com"
              required
            />
          </Field>
          <Button type="submit" disabled={busy === 'add'}>
            {busy === 'add' ? 'Adding…' : 'Add domain'}
          </Button>
        </form>
      </Card>

      <Card title={`Your domains (${verifiedCount}/${list.length} verified)`}>
        {list.length === 0 ? (
          <EmptyState
            icon={<Icon name="shield" />}
            title="No domains yet"
            hint="Add the domain your staff email addresses use, then add the TXT record we give you to prove ownership."
          />
        ) : (
          <div className="space-y-3">
            {list.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon name="shield" className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-900">{d.domain}</span>
                    <Badge>{d.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.status === 'pending' && (
                      <Button onClick={() => verify(d)} disabled={busy === d.id}>
                        {busy === d.id ? 'Checking…' : 'Verify'}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => remove(d)} disabled={busy === d.id}>
                      Remove
                    </Button>
                  </div>
                </div>

                {d.status === 'pending' ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-[12px] text-slate-500">
                      Add this <strong>TXT</strong> record at your DNS provider, then click Verify. DNS
                      changes can take a few minutes to propagate.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,2fr)]">
                      <Copyable label="Host / Name" value={d.dnsRecord.host} />
                      <Copyable label="Type" value={d.dnsRecord.type} />
                      <Copyable label="Value" value={d.dnsRecord.value} />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-brand-700">
                    Verified{d.verifiedAt ? ` on ${new Date(d.verifiedAt).toLocaleDateString()}` : ''} · you can onboard and email {d.domain} addresses.
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
