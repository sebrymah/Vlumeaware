'use client';

import { useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Lets an employee report the simulation from this page. The server only
 * credits a report that arrives before a click, so on this page it is
 * acknowledgement rather than a score — which the copy reflects honestly.
 */
export function ReportButton({ token, accent }: { token: string; accent: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  if (state === 'done') {
    return (
      <p className="text-sm text-slate-600">
        Thank you — noted. Reporting before clicking is what counts, so try to catch the next one
        earlier.
      </p>
    );
  }

  return (
    <button
      onClick={async () => {
        setState('sending');
        try {
          await fetch(`${BASE}/track/report/${encodeURIComponent(token)}`, { method: 'POST' });
        } finally {
          setState('done');
        }
      }}
      disabled={state === 'sending'}
      className="rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      style={{ background: accent }}
    >
      {state === 'sending' ? 'Sending…' : 'Report this as phishing'}
    </button>
  );
}
