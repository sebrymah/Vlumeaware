'use client';

import { useState } from 'react';
import { Button, Card, Field, Notice, inputClass } from '@/components/ui';
import { LogoMark } from '@/components/logo';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Employee portal entry. Employees have no password — they enter their work
 * email and receive a magic link to their dashboard. The response is identical
 * whether or not the email is enrolled, so it never confirms who is on file.
 */
export default function PortalRequestPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // The first request after idle can be slow (the API wakes from sleep), so
    // give it a generous window before treating it as a failure.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch(`${BASE}/portal/request-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: ctrl.signal,
      });
      // The endpoint answers the same whether or not the email is enrolled
      // (no enumeration), so a 200 is our success signal.
      if (!res.ok) throw new Error(`status ${res.status}`);
      setSent(true);
    } catch {
      setError('We couldn’t send the link just now — please try again in a moment.');
    } finally {
      clearTimeout(timer);
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

        <Card title="Your training dashboard">
          {sent ? (
            <>
              <Notice kind="ok">Check your email — the link is on its way.</Notice>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                If <span className="font-medium text-slate-900">{email}</span> is on your
                organisation&rsquo;s roster, a secure sign-in link is on its way. It can take a minute
                to arrive — check your spam folder too. The link works for 30 days.
              </p>
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => {
                  setSent(false);
                  setEmail('');
                }}
              >
                Use a different email
              </Button>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-600">
                Enter your work email and we&rsquo;ll send you a secure link — no password needed.
              </p>
              <Field label="Work email">
                <input
                  className={inputClass}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourcompany.com"
                  autoComplete="email"
                />
              </Field>
              {error && <Notice kind="error">{error}</Notice>}
              <div className="[&>button]:w-full">
                <Button type="submit" size="md" disabled={busy}>
                  {busy ? 'Sending…' : 'Email me a sign-in link'}
                </Button>
              </div>
              {busy && (
                <p className="text-xs leading-relaxed text-slate-500">
                  This can take a moment the first time — waking the server.
                </p>
              )}
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
