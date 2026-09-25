'use client';

import { useState } from 'react';

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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <div className="w-full max-w-sm rounded-xl bg-white p-7 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Your training dashboard</h1>
        {sent ? (
          <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50 p-4">
            <p className="text-sm font-medium text-brand-800">Check your email ✓</p>
            <p className="mt-1 text-sm text-brand-700">
              If <span className="font-medium">{email}</span> is on your organisation&rsquo;s roster,
              a secure sign-in link is on its way. It can take a minute to arrive — check your spam
              folder too. The link works for 30 days.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); }}
              className="mt-3 text-xs font-medium text-brand-700 underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="text-xs text-slate-500">
              Enter your work email and we&rsquo;ll send you a secure link — no password needed.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {busy && (
              <p className="text-[11px] text-slate-400">
                This can take a moment the first time — waking the server.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
