'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, Notice } from '@/components/ui';

interface ReportChannel {
  method: 'forwarding' | 'connected';
  provider: string | null;
  status: 'unconfigured' | 'active' | 'error';
  lastReceivedAt: string | null;
  forwardingAddress: string;
}

export default function ReportingSetupPage() {
  return (
    <Guard allow={['client_admin']}>
      <ReportingSetup />
    </Guard>
  );
}

function ReportingSetup() {
  const tenantId = useActingTenant();
  const [channel, setChannel] = useState<ReportChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setChannel(await api.get<ReportChannel>(`/tenants/${tenantId}/report-channel`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Phishing reporting</h1>
        <p className="mt-1 text-xs text-slate-500">
          How your staff report a suspicious email. Reports land under Reporting → Phish reports, and
          a forwarded simulation is automatically credited as a correct catch.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {!channel ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <Card title="Forwarding address" subtitle="Staff forward suspicious emails here. Works on every mail client and on mobile.">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-800">
                {channel.forwardingAddress}
              </code>
              <Button variant="ghost" onClick={() => copy(channel.forwardingAddress)}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Badge>{channel.status}</Badge>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              {channel.lastReceivedAt
                ? `Last report received ${new Date(channel.lastReceivedAt).toLocaleString()}.`
                : 'No reports received yet.'}
            </p>
          </Card>

          <Card title="Tell your staff" subtitle="Share this line in an all-staff note or your security policy.">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              To report a suspicious email, forward it to{' '}
              <span className="font-semibold">{channel.forwardingAddress}</span>.
            </div>
            <div className="mt-2">
              <Button
                variant="ghost"
                onClick={() =>
                  copy(`To report a suspicious email, forward it to ${channel.forwardingAddress}.`)
                }
              >
                {copied ? 'Copied' : 'Copy message'}
              </Button>
            </div>
          </Card>

          <Card title="How it works">
            <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
              <li>A staff member forwards a suspicious email to the address above.</li>
              <li>If it was one of our simulations, that person is credited for reporting it.</li>
              <li>If it looks like a real threat, it appears under Reporting → Phish reports for your team to triage.</li>
            </ol>
            <p className="mt-3 text-[11px] text-slate-500">
              A one-click “Report phishing” button inside the mail client is on the roadmap. Forwarding
              works everywhere today, including on phones.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
