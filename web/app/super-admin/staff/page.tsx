'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Guard } from '@/components/guard';
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyRow,
  Field,
  Notice,
  SkeletonRows,
  Table,
  inputClass,
} from '@/components/ui';

interface StaffAccount {
  id: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  deactivated: boolean;
  locked: boolean;
  awaitingPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Policy {
  requireMfa: boolean;
  passwordMinLength: number;
  sessionTimeoutMinutes: number;
}

/**
 * Vlumetech staff accounts and the platform security policy.
 *
 * This is the access-control evidence an ISO 27001 auditor asks for: who can reach
 * the platform, whether each of them has a second factor, when they last signed in,
 * how access is withdrawn, and what policy governs all of it. Every action here is
 * audited server-side.
 */
export default function StaffPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <Staff />
    </Guard>
  );
}

function Staff() {
  const { show } = useToast();
  const [rows, setRows] = useState<StaffAccount[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [mfaRequired, setMfaRequired] = useState(true);
  const [minLength, setMinLength] = useState('12');
  const [sessionMinutes, setSessionMinutes] = useState('480');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staff, security] = await Promise.all([
        api.get<StaffAccount[]>('/platform/staff'),
        api.get<Policy>('/platform/security'),
      ]);
      setRows(staff);
      setPolicy(security);
      setMfaRequired(security.requireMfa);
      setMinLength(String(security.passwordMinLength));
      setSessionMinutes(String(security.sessionTimeoutMinutes));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(job: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      const message = await job();
      show(message);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      const created = await api.post<{ email: string; emailSent: boolean }>('/platform/staff', {
        email: newEmail,
      });
      setNewEmail('');
      return created.emailSent
        ? `Invitation sent to ${created.email}. They choose their own password from the link.`
        : `${created.email} was added, but the invitation could not be emailed. Use "Reset password" to retry.`;
    });

  const resetPassword = (u: StaffAccount) =>
    run(async () => {
      const res = await api.post<{ emailSent: boolean }>(`/platform/staff/${u.id}/password-reset`);
      return res.emailSent
        ? `A fresh sign-in link is on its way to ${u.email}.`
        : `Could not email ${u.email}. Check the mail provider, then try again.`;
    });

  const resetMfa = (u: StaffAccount) =>
    run(async () => {
      await api.post(`/platform/staff/${u.id}/mfa-reset`);
      return `${u.email} must set up an authenticator again at their next sign-in.`;
    });

  const setActive = (u: StaffAccount, active: boolean) =>
    run(async () => {
      await api.post(`/platform/staff/${u.id}/${active ? 'reactivate' : 'deactivate'}`);
      return active
        ? `${u.email} can sign in again. Send them a link if they have no password.`
        : `${u.email} can no longer sign in.`;
    });

  const savePolicy = () =>
    run(async () => {
      await api.patch<Policy>('/platform/security', {
        requireMfa: mfaRequired,
        passwordMinLength: Number(minLength),
        sessionTimeoutMinutes: Number(sessionMinutes),
      });
      return 'Platform security policy saved. New sessions and accounts pick it up immediately.';
    });

  const canAdd = newEmail.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Staff &amp; access</h1>
        <p className="mt-1 text-xs text-slate-500">
          Vlumetech accounts that can reach every client. Access is granted by invitation, reviewed
          here, and withdrawn rather than deleted so the audit trail still resolves it.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <Card title="Add a staff member">
        <p className="text-xs leading-relaxed text-slate-500">
          They receive a one-time link and choose their own password — you never set or see it. If the
          policy below requires MFA, they must enrol an authenticator before using the platform.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canAdd) void add();
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <Field label="Work email">
              <input
                className={inputClass}
                type="email"
                autoComplete="off"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="colleague@vlumetech.com.ng"
              />
            </Field>
          </div>
          <Button type="submit" size="md" disabled={busy || !canAdd}>
            Send invitation
          </Button>
        </form>
      </Card>

      <Card title={`Staff accounts (${rows.length})`}>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : (
          <Table head={['Email', 'Role', 'MFA', 'Status', 'Last sign-in', '']}>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="px-2 py-2">{u.email}</td>
                <td className="px-2 py-2 text-slate-500">
                  {u.role.replace('vlumetech_', '')}
                </td>
                <td className="px-2 py-2">
                  <Badge>{u.mfaEnabled ? 'on' : 'off'}</Badge>
                </td>
                <td className="px-2 py-2">
                  {u.deactivated ? (
                    <span className="text-xs font-medium text-slate-400">deactivated</span>
                  ) : u.locked ? (
                    <span className="text-xs font-medium text-red-600">locked</span>
                  ) : u.awaitingPassword ? (
                    <span className="text-xs font-medium text-amber-700">no password yet</span>
                  ) : (
                    <span className="text-xs text-slate-500">active</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'never'}
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-end gap-1">
                    {u.deactivated ? (
                      <Button variant="ghost" onClick={() => setActive(u, true)} disabled={busy}>
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => resetPassword(u)} disabled={busy}>
                          Reset password
                        </Button>
                        <Button variant="ghost" onClick={() => resetMfa(u)} disabled={busy}>
                          Reset MFA
                        </Button>
                        <ConfirmButton
                          label="Deactivate"
                          confirmLabel="Deactivate"
                          question={`Deactivate ${u.email}? They lose access immediately and must sign in again after being restored.`}
                          onConfirm={() => setActive(u, false)}
                          disabled={busy}
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <EmptyRow
                colSpan={6}
                title="No staff accounts yet"
                hint="Add a colleague above. Until then, only the seeded account exists."
              />
            )}
          </Table>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          <b>Reset MFA</b> is the recovery path when someone loses their authenticator: it clears the
          secret so they enrol again, without touching their password. You cannot deactivate your own
          account, and the last active administrator cannot be deactivated.
        </p>
      </Card>

      <Card title="Platform security policy">
        <p className="text-xs leading-relaxed text-slate-500">
          Applies to every Vlumetech account. These are the settings an auditor will ask to see, so
          they are stated here rather than left as defaults in the code.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Staff MFA" hint={mfaRequired ? 'Required for everyone' : 'Optional'}>
            <label className="flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <input
                type="checkbox"
                checked={mfaRequired}
                onChange={(e) => setMfaRequired(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm text-slate-700">Require multi-factor authentication</span>
            </label>
          </Field>
          <Field label="Password minimum" hint="12 characters or more">
            <input
              className={inputClass}
              type="number"
              min={12}
              max={64}
              value={minLength}
              onChange={(e) => setMinLength(e.target.value)}
            />
          </Field>
          <Field label="Session length" hint="15 minutes to 24 hours">
            <input
              className={inputClass}
              type="number"
              min={15}
              max={1440}
              value={sessionMinutes}
              onChange={(e) => setSessionMinutes(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="md" onClick={savePolicy} disabled={busy}>
            Save policy
          </Button>
          {policy && (
            <span className="text-[11px] text-slate-500">
              Currently: MFA {policy.requireMfa ? 'required' : 'optional'}, minimum{' '}
              {policy.passwordMinLength} characters, {policy.sessionTimeoutMinutes}-minute sessions.
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
