'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Button, Card, Field, Notice, inputClass } from '@/components/ui';

interface Access {
  level: 'full' | 'trial' | 'readonly' | 'suspended' | 'offboarded';
  approved: boolean;
  daysLeft: number | null;
  seatLimit: number | null;
  licenseTier: string | null;
  licenseEndsAt: string | null;
  licenseDaysLeft: number | null;
}

export default function LicensePage() {
  return (
    <Guard allow={['client_admin']}>
      <License />
    </Guard>
  );
}

function License() {
  const tenantId = useActingTenant();
  const [access, setAccess] = useState<Access | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setAccess(await api.get<Access>(`/tenants/${tenantId}/trial`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.post<{ licenseTier: string; seatLimit: number | null }>(
        `/tenants/${tenantId}/license/redeem`,
        { key },
      );
      setOk(
        `Activated. Your plan is ${res.licenseTier}` +
          `${res.seatLimit != null ? ` with ${res.seatLimit} seats` : ' with unlimited seats'}.`,
      );
      setKey('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const activated = access?.approved === true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">License</h1>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          Your current plan, and where you enter a license key from Vlumetech.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      {access?.licenseEndsAt &&
        access.licenseDaysLeft != null &&
        access.licenseDaysLeft <= 30 && (
          <Notice kind={access.licenseDaysLeft <= 0 ? 'error' : 'info'}>
            {access.licenseDaysLeft <= 0
              ? 'Your licence has ended. The account is read-only until it is renewed — contact Vlumetech for a new licence key.'
              : `Your licence ends in ${access.licenseDaysLeft} day${access.licenseDaysLeft === 1 ? '' : 's'}. Contact Vlumetech to renew before it lapses, or enter a new key below.`}
          </Notice>
        )}

      <Card title="Current plan">
        {!access ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Plan</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {access.licenseTier ?? 'None'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Seats</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {access.seatLimit != null ? access.seatLimit : 'Unlimited'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Term</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {access.licenseEndsAt ? (
                  access.licenseDaysLeft != null && access.licenseDaysLeft > 0 ? (
                    <span>{access.licenseDaysLeft} day{access.licenseDaysLeft === 1 ? '' : 's'} left</span>
                  ) : (
                    <span className="text-red-700">Expired</span>
                  )
                ) : (
                  'No fixed term'
                )}
              </dd>
              {access.licenseEndsAt && (
                <dd className="mt-0.5 text-[11px] text-slate-400">
                  {access.licenseDaysLeft != null && access.licenseDaysLeft > 0 ? 'renews' : 'ended'}{' '}
                  {new Date(access.licenseEndsAt).toLocaleDateString()}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status</dt>
              <dd className="mt-1 text-sm font-medium">
                {activated ? (
                  <span className="text-brand-700">Active</span>
                ) : access.level === 'trial' ? (
                  <span className="text-amber-700">
                    Trial{access.daysLeft != null ? ` — ${access.daysLeft} day${access.daysLeft === 1 ? '' : 's'} left` : ''}
                  </span>
                ) : (
                  <span className="text-amber-700">{access.level}</span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </Card>

      <Card
        title="Enter a license key"
        subtitle="Vlumetech sends this when your plan is agreed. Entering it activates the account."
      >
        <form onSubmit={redeem} className="space-y-3">
          <Field
            label="License key"
            hint="Looks like VLA-XXXXX-XXXXX-XXXXX-XXXXX. Case and hyphens do not matter."
          >
            <input
              className={`${inputClass} font-mono tracking-wider`}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="VLA-XXXXX-XXXXX-XXXXX-XXXXX"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
            />
          </Field>
          <Button type="submit" disabled={busy || !key.trim()}>
            {busy ? 'Activating…' : 'Activate'}
          </Button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            A key is issued for your organisation alone and can be used once. If it does not work,
            check it was copied in full — otherwise ask Vlumetech to issue a new one.
          </p>
        </form>
      </Card>
    </div>
  );
}
