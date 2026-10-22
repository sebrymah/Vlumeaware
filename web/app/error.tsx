'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/logo';

/**
 * What a thrown render lands on.
 *
 * Without this file Next shows its own error screen: no branding, no context, and
 * often nothing to click. A console is a place people do consequential things, so
 * the page says plainly that nothing was changed and gives them a way back. The
 * reset button retries the segment, which is usually all that is needed after a
 * transient API failure.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept on the console so a support request can quote the digest.
    console.error('Console render failed:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-md text-center">
        <LogoMark size={28} className="mx-auto" />
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Something went wrong
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          This page could not load
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          Nothing was changed by this. Try again, and if it keeps happening send the reference
          below to your Vlumetech contact.
        </p>
        {error.digest && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-600">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Go to the console
          </Link>
        </div>
      </div>
    </main>
  );
}
