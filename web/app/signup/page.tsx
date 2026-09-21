'use client';

import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/logo';
import { useState } from 'react';
import Link from 'next/link';
import { login } from '@/lib/api';
import { homeFor, writeSession, type Role } from '@/lib/session';
import { Field, Notice, inputClass } from '@/components/ui';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Public self-serve signup. Creates a Free-trial workspace and signs the new
 * client_admin straight in. The trial is explore-only (no campaigns) and capped
 * at 20 employee seats until a Vlumetech admin approves the account.
 */
export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Signup failed');
      }
      // Sign straight in. A brand-new client_admin has no MFA, so a token is returned.
      const auth = await login(email, password);
      if (!auth.accessToken) throw new Error('Could not sign in automatically. Please sign in.');
      writeSession({ accessToken: auth.accessToken, role: auth.role as Role, tenantId: auth.tenantId, email });
      router.replace(homeFor(auth.role as Role));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            <LogoMark size={22} className="mr-1.5 inline-block align-[-3px]" />
            Vlume<span className="text-brand-600">aware</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">Start a free trial</p>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            7-day trial · up to 20 employees · set up your workspace right away. Running live
            simulations unlocks once Vlumetech approves your account.
          </p>
        </div>

        {error && <Notice kind="error">{error}</Notice>}

        <Field label="Company name">
          <input className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} required minLength={2} />
        </Field>
        <Field label="Work email">
          <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" hint="At least 12 characters.">
          <input className={inputClass} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {busy ? 'Creating your workspace…' : 'Start free trial'}
        </button>
        <p className="text-[11px] text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
