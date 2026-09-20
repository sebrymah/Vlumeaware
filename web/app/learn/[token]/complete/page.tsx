'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Learn {
  employeeName: string;
  completed: boolean;
  tenant: { name: string; brandLogoUrl: string | null; brandPrimaryColor: string | null } | null;
  module: { title: string; description: string | null; videoUrl: string } | null;
  certificate: {
    serial: string;
    moduleTitle: string;
    scorePct: number;
    issuedAt: string;
  } | null;
}

/**
 * The page an employee lands on once their training is finished. Addressed by
 * the same token as the training itself, and read from the record rather than
 * from state carried over the redirect, so refreshing it or returning to the
 * link later still shows the outcome.
 */
export default function CompletePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const search = useSearchParams();
  // Whether the certificate email went out is known only at the moment of
  // submission; it is not recorded against the certificate, so a refresh
  // simply omits the claim rather than guessing.
  const emailed = search.get('emailed') === '1';

  const [data, setData] = useState<Learn | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/learn/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('This training link is no longer valid.');
        setData(await res.json());
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </main>
    );
  }
  if (!data) {
    return <main className="mx-auto max-w-2xl px-6 py-10 text-sm text-slate-500">Loading…</main>;
  }

  const accent = data.tenant?.brandPrimaryColor || '#0B7C57';
  const cert = data.certificate;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        {data.tenant?.brandLogoUrl ? (
          <img src={data.tenant.brandLogoUrl} alt="" className="h-8 w-auto" />
        ) : (
          <span className="font-semibold text-slate-900">{data.tenant?.name ?? 'Security Awareness'}</span>
        )}
        <span
          className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
          style={{ background: accent }}
        >
          Security Awareness
        </span>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl text-white"
          style={{ background: accent }}
          aria-hidden
        >
          ✓
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Training complete</h1>
        <p className="mt-1 text-sm text-slate-500">
          Thank you, {data.employeeName} — there is nothing more to do.
        </p>

        {data.module && (
          <p className="mt-4 text-sm text-slate-700">
            You completed <strong>{data.module.title}</strong>.
          </p>
        )}

        {cert && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
            <h2 className="text-sm font-semibold text-slate-900">Your certificate</h2>
            <dl className="mt-2 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between gap-4">
                <dt>Score</dt>
                <dd className="font-medium text-slate-900">{cert.scorePct}%</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Issued</dt>
                <dd className="font-medium text-slate-900">
                  {new Date(cert.issuedAt).toLocaleDateString()}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Serial</dt>
                <dd className="font-mono font-medium text-slate-900">{cert.serial}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              {emailed
                ? 'A copy has been emailed to you. '
                : 'Your employer can send you a copy at any time. '}
              Anyone can confirm it is genuine at{' '}
              <a
                className="underline"
                href={`${BASE}/verify/${encodeURIComponent(cert.serial)}`}
                target="_blank"
                rel="noreferrer"
              >
                /verify/{cert.serial}
              </a>
              .
            </p>
          </div>
        )}

        {!cert && (
          <p className="mt-6 text-xs text-slate-500">
            This module had no assessment, so no certificate was issued.
          </p>
        )}
      </section>
    </main>
  );
}
