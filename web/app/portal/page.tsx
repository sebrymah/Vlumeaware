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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(`${BASE}/portal/request-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* show the same confirmation regardless */
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <div className="w-full max-w-sm rounded-xl bg-white p-7 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Your training dashboard</h1>
        {sent ? (
          <p className="mt-3 text-sm text-slate-600">
            If <span className="font-medium">{email}</span> is on your organisation&rsquo;s roster,
            we&rsquo;ve emailed a secure sign-in link. Open it to see your courses, certificates and
            history. The link works for 30 days.
          </p>
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
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
