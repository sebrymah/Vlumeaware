'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card, Field, Notice, inputClass } from '@/components/ui';
import { LogoMark } from '@/components/logo';

/**
 * Where an invitation or password-reset email lands.
 *
 * The token is the only credential the visitor holds, so this page does one
 * thing: lets them choose a password. It deliberately names the account it is
 * for, so someone who receives a link they did not expect can see it is not
 * theirs, and it never reveals whether some *other* address exists.
 */
interface InviteDetails {
  email: string;
  tenantName: string;
  /** The tenant's own policy, so the page can state the real rule. */
  passwordMinLength: number;
  expiresAt: string;
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setDetails(await api.get<InviteDetails>(`/auth/console-invite/${token}`));
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ email: string }>(`/auth/console-invite/${token}`, { password });
      setDone(res.email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <LogoMark size={22} />
          <span className="text-[15px] font-extrabold tracking-tight text-slate-900">
            Vlume<span className="text-brand-600">aware</span>
          </span>
        </div>

        <Card title="Choose your password">
          {loadError && (
            <Notice kind="error">
              {loadError} Ask the administrator of your account to send a new link.
            </Notice>
          )}

          {!loadError && !details && (
            <p role="status" aria-live="polite" className="py-4 text-sm text-slate-500">
              Checking your link…
            </p>
          )}

          {details && !done && (
            <>
              <p className="text-sm leading-relaxed text-slate-600">
                You are setting the password for <b>{details.email}</b> on{' '}
                <b>{details.tenantName}</b>.
              </p>
              <form onSubmit={submit} className="mt-5 space-y-4">
                <Field
                  label="New password"
                  hint={`At least ${details.passwordMinLength} characters`}
                >
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="new-password"
                    minLength={details.passwordMinLength}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field label="Confirm password">
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
                {error && <Notice kind="error">{error}</Notice>}
                <div className="[&>button]:w-full">
                  <Button type="submit" size="md" disabled={busy || !password || !confirm}>
                    {busy ? 'Saving…' : 'Save password'}
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  The link works once; afterwards sign in normally.
                </p>
              </form>
            </>
          )}

          {done && (
            <>
              <Notice kind="ok">
                Password set for <b>{done}</b>.
              </Notice>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                You can now sign in with that password. If your account requires multi-factor
                authentication, you will be asked to set it up before you start.
              </p>
              <Link href="/login" className="mt-4 inline-block">
                <Button size="md">Go to sign in</Button>
              </Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
