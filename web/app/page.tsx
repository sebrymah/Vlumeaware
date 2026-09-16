'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, readSession } from '@/lib/session';

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const session = readSession();
    router.replace(session ? homeFor(session.role) : '/login');
  }, [router]);
  return <div className="p-8 text-sm text-slate-500">Redirecting…</div>;
}
