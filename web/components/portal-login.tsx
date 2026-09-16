'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { login } from '@/lib/api';
import { homeFor, loginPathFor, writeSession, type Role } from '@/lib/session';
import { Field, Notice, inputClass } from '@/components/ui';

/**
 * A role-gated login form. Each portal (client vs Vlumetech staff) renders this
 * with the roles it accepts. Signing in with a role that belongs to the OTHER
 * portal is refused — the session is not stored — and the user is pointed at the
 * correct URL. This keeps the two entry points genuinely separate.
 */
export function PortalLogin({
  allow,
  title,
  subtitle,
  otherPortalLabel,
  showSignup,
}: {
  allow: Role[];
  title: string;
  subtitle: string;
  otherPortalLabel: string;
  showSignup?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(email, password);
      const role = res.role as Role;
      if (!allow.includes(role)) {
        const other = loginPathFor(role);
        setError(
          <>
            This account belongs to the {otherPortalLabel}.{' '}
            <Link href={other} className="underline">
              Go to {other}
            </Link>
            .
          </>,
        );
        return;
      }
      writeSession({ accessToken: res.accessToken, role, tenantId: res.tenantId, email });
      router.replace(homeFor(role));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Vlume<span className="text-brand-600">aware</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          <p className="mt-3 text-sm font-medium text-slate-600">{title}</p>
        </div>

        {error && <Notice kind="error">{error}</Notice>}

        <Field label="Work email">
          <input
            className={inputClass}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {showSignup ? (
          <p className="text-[11px] text-slate-600">
            New here?{' '}
            <Link href="/signup" className="underline">
              Start a free trial
            </Link>
            .
          </p>
        ) : (
          <p className="text-[11px] text-slate-600">
            Accounts are provisioned by Vlumetech.
          </p>
        )}
      </form>
    </div>
  );
}
