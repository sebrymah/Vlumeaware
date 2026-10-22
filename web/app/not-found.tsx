'use client';

import Link from 'next/link';
import { LogoMark } from '@/components/logo';

/**
 * The page a mistyped or dead link lands on.
 *
 * Next's default is a bare, unbranded line of text with no way back — which reads
 * as "this product is broken" rather than "that address is not right". This keeps
 * the visitor inside the product and offers exactly two ways forward.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-md text-center">
        <LogoMark size={28} className="mx-auto" />
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Page not found
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          That link does not go anywhere
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          The address may be mistyped, or the page may have moved. Nothing has changed on your
          account.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Go to the console
          </Link>
          <Link
            href="/docs"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Setup guide
          </Link>
        </div>
      </div>
    </main>
  );
}
