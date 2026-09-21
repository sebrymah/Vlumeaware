'use client';

import { use, useEffect, useState } from 'react';
import { LogoMark } from '@/components/logo';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Verified {
  serial: string;
  moduleTitle: string;
  quizTitle: string | null;
  scorePct: number;
  issuedAt: string;
  tenant: { name: string } | null;
  employee: { name: string } | null;
}

type State = { status: 'loading' } | { status: 'valid'; cert: Verified } | { status: 'unknown' };

/**
 * Public certificate verification. Reached from the serial printed on every
 * certificate and from the link in the completion email, so its audience is
 * whoever is checking the claim — an auditor, a client, a hiring manager —
 * none of whom have an account here. No auth, and nothing about the holder
 * beyond what the certificate itself already states.
 */
export default function VerifyPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = use(params);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    fetch(`${BASE}/verify/${encodeURIComponent(serial)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return setState({ status: 'unknown' });
        const body = await res.text();
        // An unknown serial comes back as an empty body or null rather than a 404.
        if (!body || body === 'null') return setState({ status: 'unknown' });
        setState({ status: 'valid', cert: JSON.parse(body) as Verified });
      })
      .catch(() => setState({ status: 'unknown' }));
  }, [serial]);

  return (
    <main className="mx-auto max-w-xl px-6 py-14">
      <div className="mb-8 flex items-center justify-between">
        <span className="text-base font-semibold text-slate-900">
          <LogoMark size={18} className="mr-1.5 inline-block align-[-3px]" />
          Vlume<span className="text-brand-600">aware</span>
        </span>
        <span className="text-[11px] uppercase tracking-widest text-slate-400">
          Certificate verification
        </span>
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Checking…</p>}

      {state.status === 'unknown' && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">No certificate with this serial</h1>
          <p className="mt-2 text-sm text-slate-600">
            Nothing on record matches{' '}
            <span className="font-mono text-slate-900">{serial}</span>. Check the serial against the
            certificate, which is case-sensitive, or ask the issuing organisation to confirm it.
          </p>
        </section>
      )}

      {state.status === 'valid' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-brand-50 px-6 py-4">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
              aria-hidden
            >
              ✓
            </span>
            <div>
              <h1 className="text-base font-semibold text-slate-900">This certificate is genuine</h1>
              <p className="text-xs text-slate-600">
                Issued by {state.cert.tenant?.name ?? 'the organisation'} and recorded by Vlumeaware.
              </p>
            </div>
          </div>

          <dl className="divide-y divide-slate-100 px-6 py-2 text-sm">
            <Row label="Awarded to" value={state.cert.employee?.name ?? '—'} />
            <Row label="Module" value={state.cert.moduleTitle} />
            {state.cert.quizTitle && <Row label="Assessment" value={state.cert.quizTitle} />}
            <Row label="Score" value={`${state.cert.scorePct}%`} />
            <Row
              label="Issued"
              value={new Date(state.cert.issuedAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            />
            <Row label="Serial" value={state.cert.serial} mono />
          </dl>

          <p className="border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
            This page reads the issuing record directly, so it confirms the certificate rather than
            the document. An altered or forged PDF will not change what is shown here.
          </p>
        </section>
      )}
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-6 py-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
