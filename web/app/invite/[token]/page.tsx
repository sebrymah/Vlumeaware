'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

/**
 * Where an invitation or password-reset email lands.
 *
 * The token is the only credential the visitor holds, so this page does one
 * thing: lets them choose a password. It deliberately shows the address the
 * account is for, so someone who receives a link they did not expect can tell it
 * is not for them, and it never reveals whether a *different* address exists.
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
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-card">
        <h1 className="text-lg font-semibold text-slate-900">Choose your password</h1>

        {loadError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
            <p className="mt-2 text-xs text-red-600">
              Ask the administrator of your account to send a new link.
            </p>
          </div>
        )}

        {!loadError && !details && <p className="mt-4 text-sm text-slate-500">Checking your link…</p>}

        {details && !done && (
          <>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              You are setting the password for <b>{details.email}</b> on{' '}
              <b>{details.tenantName}</b>.
            </p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">New password</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  type="password"
                  autoComplete="new-password"
                  minLength={details.passwordMinLength}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Confirm password</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy || !password || !confirm}
                className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save password'}
              </button>
              <p className="text-[11px] leading-relaxed text-slate-500">
                At least {details.passwordMinLength} characters. The link works once; afterwards sign
                in normally.
              </p>
            </form>
          </>
        )}

        {done && (
          <div className="mt-4">
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700">
              Password set for <b>{done}</b>.
            </div>
            <p className="mt-3 text-sm text-slate-600">
              You can now sign in with that password. If your account requires multi-factor
              authentication, you will be asked to set it up before you start.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
