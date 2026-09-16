'use client';

import { useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const EMAIL_SHAPED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The submit handler derives non-reversible metadata locally and posts ONLY
 * that. The typed username and password never leave the browser — they are read
 * to measure length and shape, then discarded when the component unmounts on
 * navigation. There is intentionally no field in the request that could carry
 * the secret.
 */
export function LoginForm({ token, accent }: { token: string; accent: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const reveal = () => {
    window.location.href = `/t/${encodeURIComponent(token)}`;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(`${BASE}/track/submit/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameLength: username.length,
          passwordLength: password.length,
          usernameLooksLikeEmail: EMAIL_SHAPED.test(username.trim()),
        }),
      });
    } catch {
      // The reveal must happen regardless of whether logging succeeded.
    } finally {
      reveal();
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Work email</span>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
          required
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
          required
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        style={{ background: accent }}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <button
        type="button"
        onClick={reveal}
        className="w-full text-center text-[11px] text-slate-500 hover:text-slate-700"
      >
        I don&rsquo;t recognise this — take me back
      </button>
    </form>
  );
}
