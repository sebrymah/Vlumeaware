'use client';

import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/logo';
import { useState } from 'react';
import Link from 'next/link';
import { login, verifyMfa, type LoginResponse } from '@/lib/api';
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
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  function completeSession(res: LoginResponse) {
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
    writeSession({ accessToken: res.accessToken as string, role, tenantId: res.tenantId, email });
    // An account that must enrol cannot use the API until it has, so it is sent
    // straight to the enrolment screen — in its OWN portal. Client users were
    // previously sent to the staff page, which their role cannot open, leaving
    // them enforced with no way to satisfy it.
    if (res.mfaEnrollmentRequired) {
      const securityPath =
        role === 'vlumetech_superadmin' ? '/super-admin/security' : '/client/security';
      router.replace(`${securityPath}?enroll=1`);
      return;
    }
    router.replace(homeFor(role));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(email, password);
      if (res.mfaRequired && res.mfaChallenge) {
        setChallenge(res.mfaChallenge);
        return;
      }
      completeSession(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      completeSession(await verifyMfa(challenge, code.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <form onSubmit={submitCode} className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              <LogoMark size={22} className="mr-1.5 inline-block align-[-3px]" />
              Vlume<span className="text-brand-600">aware</span>
            </h1>
            <p className="mt-3 text-sm font-medium text-slate-600">Two-factor authentication</p>
            <p className="mt-1 text-xs text-slate-500">Enter the 6-digit code from your authenticator app.</p>
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Authentication code">
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </Field>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => { setChallenge(null); setCode(''); setError(null); }}
            className="w-full text-[11px] text-slate-500 hover:text-slate-700"
          >
            ← Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            <LogoMark size={22} className="mr-1.5 inline-block align-[-3px]" />
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
