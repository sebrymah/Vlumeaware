'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  Field,
  Notice,
  SkeletonRows,
  Table,
  inputClass,
} from '@/components/ui';
import { readSession } from '@/lib/session';

interface SecurityUser {
  id: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  locked: boolean;
  /** Invited, but has not followed the link and chosen a password yet. */
  invitePending: boolean;
  /** Access withdrawn; the record is kept so it can be restored or audited. */
  deactivated: boolean;
}

interface Security {
  passwordMinLength: number;
  sessionTimeoutMinutes: number;
  requireMfa: boolean;
  users: SecurityUser[];
}

interface AuditEntry {
  id: string;
  action: string;
  detail: string | null;
  actorRole: string | null;
  createdAt: string;
}

export default function SecurityPage() {
  return (
    <Guard allow={['client_admin']}>
      <Security />
    </Guard>
  );
}

function Security() {
  const tenantId = useActingTenant();
  const me = readSession()?.email;

  const [security, setSecurity] = useState<Security | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [minLength, setMinLength] = useState('12');
  const [timeout, setTimeoutMins] = useState('480');
  const [requireMfa, setRequireMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New console user (a colleague this admin is adding). No password: they get
  // an emailed link and choose their own, so this admin never knows it.
  const [newUser, setNewUser] = useState({ email: '', role: 'client_admin' });

  // MFA enrolment for the signed-in admin.
  const [enrolment, setEnrolment] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');

  // Password change.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [s, a] = await Promise.all([
        api.get<Security>(`/tenants/${tenantId}/security`),
        api.get<AuditEntry[]>(`/tenants/${tenantId}/audit-log`).catch(() => [] as AuditEntry[]),
      ]);
      setSecurity(s);
      setAudit(a);
      setMinLength(String(s.passwordMinLength));
      setTimeoutMins(String(s.sessionTimeoutMinutes));
      setRequireMfa(s.requireMfa);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(job: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      setOk(await job());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const savePolicy = () =>
    run(async () => {
      await api.patch(`/tenants/${tenantId}/security`, {
        passwordMinLength: Number(minLength),
        sessionTimeoutMinutes: Number(timeout),
        requireMfa,
      });
      return 'Security policy saved. It applies from the next sign-in.';
    });

  const startMfa = () =>
    run(async () => {
      setEnrolment(await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup'));
      return 'Scan the key below in your authenticator app, then enter a code to finish.';
    });

  const activateMfa = () =>
    run(async () => {
      await api.post('/auth/mfa/activate', { code });
      setEnrolment(null);
      setCode('');
      return 'Multi-factor authentication is on for your account.';
    });

  const disableMfa = () =>
    run(async () => {
      await api.post('/auth/mfa/disable');
      return 'Multi-factor authentication is off for your account.';
    });

  const changePassword = () =>
    run(async () => {
      await api.post('/auth/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      return 'Password changed.';
    });

  const unlock = (user: SecurityUser) =>
    run(async () => {
      await api.post(`/tenants/${tenantId}/users/${user.id}/unlock`);
      return `${user.email} can sign in again.`;
    });

  const addUser = () =>
    run(async () => {
      const created = await api.post<{ email: string; emailSent: boolean }>(
        `/tenants/${tenantId}/users`,
        newUser,
      );
      setNewUser({ email: '', role: 'client_admin' });
      return created.emailSent
        ? `Invitation sent to ${created.email}. They choose their own password from the link.`
        : `${created.email} was added, but the invitation could not be emailed. Use "Send link" to try again.`;
    });

  const sendLink = (user: SecurityUser) =>
    run(async () => {
      const res = await api.post<{ emailSent: boolean }>(
        `/tenants/${tenantId}/users/${user.id}/invite`,
      );
      return res.emailSent
        ? `A fresh sign-in link is on its way to ${user.email}.`
        : `Could not email ${user.email}. Check the mail provider, then try again.`;
    });

  const setActive = (user: SecurityUser, active: boolean) =>
    run(async () => {
      await api.post(
        `/tenants/${tenantId}/users/${user.id}/${active ? 'reactivate' : 'deactivate'}`,
      );
      return active
        ? `${user.email} can sign in again. Send them a link if they have no password.`
        : `${user.email} can no longer sign in.`;
    });

  /**
   * Arriving from sign-in with ?enroll=1 means this account must enrol before it
   * can use the API. The flow is started automatically, rather than leaving the
   * user to find the button on a console that otherwise refuses their requests.
   */
  const autoEnrolStarted = useRef(false);
  useEffect(() => {
    if (autoEnrolStarted.current) return;
    const wantsEnrol =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('enroll') === '1';
    if (!wantsEnrol) return;
    if (security?.users.find((u) => u.email === me)?.mfaEnabled) return;
    autoEnrolStarted.current = true;
    void startMfa();
  }, [security, me, startMfa]);

  if (!security) return error ? <p className="text-sm text-slate-500">{error}</p> : <SkeletonRows rows={6} />;

  const myMfa = security.users.find((u) => u.email === me)?.mfaEnabled ?? false;
  const hours = Math.round((Number(timeout) / 60) * 10) / 10;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Security</h1>
        <p className="mt-1 text-xs text-slate-500">
          How your people sign in to this console, and a record of what has been done in your
          account.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card
        title="Sign-in policy"
        subtitle="Applies to everyone in your organisation, from their next sign-in."
        actions={
          <Button onClick={savePolicy} disabled={busy}>
            Save policy
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum password length" hint="Between 8 and 64.">
            <input
              className={inputClass}
              type="number"
              min={8}
              max={64}
              value={minLength}
              onChange={(e) => setMinLength(e.target.value)}
            />
          </Field>
          <Field label="Session timeout (minutes)" hint={`${hours} hours before re-authentication.`}>
            <input
              className={inputClass}
              type="number"
              min={15}
              max={43200}
              value={timeout}
              onChange={(e) => setTimeoutMins(e.target.value)}
            />
          </Field>
          <Field label="Multi-factor authentication">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={requireMfa}
                onChange={(e) => setRequireMfa(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Require it for everyone
            </label>
          </Field>
        </div>
        {requireMfa && !security.requireMfa && (
          <p className="mt-3 text-xs text-amber-700">
            Turning this on will prompt every user without MFA to enrol at their next sign-in, and
            nobody will be able to switch it off for themselves.
          </p>
        )}
      </Card>

      <Card
        title="Your account"
        subtitle="Multi-factor authentication and password for the account you are signed in with."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-700">{me}</span>
          <Badge>{myMfa ? 'MFA on' : 'MFA off'}</Badge>
          {!myMfa && !enrolment && (
            <Button variant="ghost" onClick={startMfa} disabled={busy}>
              Turn on MFA
            </Button>
          )}
          {myMfa && !security.requireMfa && (
            <Button variant="ghost" onClick={disableMfa} disabled={busy}>
              Turn off MFA
            </Button>
          )}
        </div>

        {enrolment && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-600">
              Add this key to your authenticator app, then enter the six-digit code it shows.
            </p>
            <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-xs text-slate-900">
              {enrolment.secret}
            </code>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Code from your app">
                <input
                  className={`${inputClass} w-32 font-mono`}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                />
              </Field>
              <Button onClick={activateMfa} disabled={busy || code.length !== 6}>
                Confirm
              </Button>
              <Button variant="ghost" onClick={() => setEnrolment(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <Field label="Current password">
            <input
              className={inputClass}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password" hint={`At least ${security.passwordMinLength} characters.`}>
            <input
              className={inputClass}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={changePassword}
              disabled={busy || !currentPassword || newPassword.length < security.passwordMinLength}
            >
              Change password
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`Console users (${security.users.length})`}>
        <Table head={['Email', 'Role', 'MFA', 'Status', '']}>
          {security.users.map((u) => (
            <tr key={u.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{u.email}</td>
              <td className="px-2 py-2 text-slate-500">{u.role}</td>
              <td className="px-2 py-2">
                <Badge>{u.mfaEnabled ? 'on' : 'off'}</Badge>
              </td>
              <td className="px-2 py-2">
                {u.deactivated ? (
                  <span className="text-xs font-medium text-slate-400">deactivated</span>
                ) : u.locked ? (
                  <span className="text-xs font-medium text-red-600">locked</span>
                ) : u.invitePending ? (
                  <span className="text-xs font-medium text-amber-700">invited</span>
                ) : (
                  <span className="text-xs text-slate-500">active</span>
                )}
              </td>
              <td className="px-2 py-2">
                <div className="flex justify-end gap-1">
                  {u.locked && (
                    <Button variant="ghost" onClick={() => unlock(u)} disabled={busy}>
                      Unlock
                    </Button>
                  )}
                  {u.email !== me &&
                    (u.deactivated ? (
                      <Button variant="ghost" onClick={() => setActive(u, true)} disabled={busy}>
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => sendLink(u)} disabled={busy}>
                          {u.invitePending ? 'Resend link' : 'Reset password'}
                        </Button>
                        <ConfirmButton
                          label="Deactivate"
                          confirmLabel="Deactivate"
                          question={`Deactivate ${u.email}? They lose access immediately. The account can be restored later.`}
                          onConfirm={() => setActive(u, false)}
                          disabled={busy}
                        />
                      </>
                    ))}
                </div>
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-[11px] text-slate-400">
          <b>Invited</b> means the emailed link has not been used yet, so no password has been chosen.
          <b> Reset password</b> emails a fresh link and invalidates any earlier one. <b>Deactivate</b>
          withdraws access immediately but keeps the record, so it can be restored; you cannot
          deactivate yourself, and the last active administrator cannot be deactivated. An account
          locks itself after repeated failed sign-ins; Unlock releases it early.
        </p>
      </Card>

      <Card title="Add a console user">
        <p className="text-xs leading-relaxed text-slate-500">
          Console users sign in to this dashboard. <b>Administrators</b> can change settings, people,
          campaigns and other console users; <b>viewers</b> can read everything but change nothing.
          This is separate from <b>Employees</b>, which is the list of people receiving simulations.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Email address" hint="They are emailed a link">
            <input
              className={inputClass}
              type="email"
              autoComplete="off"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              className={inputClass}
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              <option value="client_admin">Administrator</option>
              <option value="client_viewer">Viewer</option>
            </select>
          </Field>
          <div className="flex items-end">
            <Button onClick={addUser} disabled={busy || !newUser.email.trim()}>
              Send invitation
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          You do not set their password. They receive a one-time link, choose one themselves, and it
          must be at least {security.passwordMinLength} characters to match your policy.
          {security.requireMfa &&
            ' Because this account requires multi-factor authentication, they will also set that up before first use.'}
        </p>
      </Card>

      <Card
        title="Audit log"
        subtitle="What has been done in your account, most recent first."
      >
        {audit.length ? (
          <Table head={['When', 'Action', 'Detail', 'By']}>
            {audit.map((entry) => (
              <tr key={entry.id} className="border-b border-slate-100">
                <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-2 py-2 font-medium text-slate-900">{entry.action}</td>
                <td className="px-2 py-2 text-slate-500">{entry.detail ?? '—'}</td>
                <td className="px-2 py-2 text-slate-500">{entry.actorRole ?? '—'}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-xs text-slate-500">Nothing recorded yet.</p>
        )}
      </Card>
    </div>
  );
}
