'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clearSession, homeFor, loginPathFor, loginPathForAllowed, readSession, type Role, type Session } from '@/lib/session';
import { TrialBanner } from '@/components/trial-banner';

const NAV: Record<Role, Array<{ href: string; label: string }>> = {
  vlumetech_superadmin: [
    { href: '/super-admin', label: 'Clients' },
    { href: '/super-admin/library', label: 'Shared library' },
    { href: '/super-admin/audit', label: 'Audit log' },
  ],
  client_admin: [
    { href: '/client', label: 'Campaigns' },
    { href: '/client/scenarios', label: 'Scenarios' },
    { href: '/client/templates', label: 'Templates' },
    { href: '/client/employees', label: 'Employees' },
    { href: '/client/content', label: 'Awareness content' },
    { href: '/client/quizzes', label: 'Quizzes' },
    { href: '/client/routing', label: 'Training routing' },
    { href: '/client/risk', label: 'Risk' },
    { href: '/client/certificates', label: 'Certificates' },
    { href: '/client/reported', label: 'Reported' },
  ],
  client_viewer: [
    { href: '/dashboard', label: 'Reporting' },
    { href: '/client/risk', label: 'Risk' },
    { href: '/client/certificates', label: 'Certificates' },
    { href: '/client/reported', label: 'Reported' },
  ],
};

/**
 * Client-side route gate. The API enforces the same boundaries independently —
 * this only decides what to render, and a tampered localStorage role gets 403s
 * from every call it tries to make.
 */
export function Guard({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const s = readSession();
    if (!s) {
      router.replace(loginPathForAllowed(allow));
      return;
    }
    if (!allow.includes(s.role)) {
      router.replace(homeFor(s.role));
      return;
    }
    setSession(s);
  }, [allow, router]);

  if (session === undefined) {
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  }
  if (session === null) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href={homeFor(session.role)} className="text-sm font-semibold text-slate-100">
            Vlume<span className="text-emerald-500">aware</span>
          </Link>
          <nav className="flex gap-4 text-xs">
            {NAV[session.role].map((item) => (
              <Link key={item.href} href={item.href} className="text-slate-400 hover:text-slate-100">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span>{session.email}</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
              {session.role}
            </span>
            <button
              onClick={() => {
                const dest = loginPathFor(session.role);
                clearSession();
                router.replace(dest);
              }}
              className="text-slate-400 hover:text-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {session.role !== 'vlumetech_superadmin' && <TrialBanner />}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

/**
 * Tenant the current session acts on. Client-side roles are bound to exactly
 * one tenant by their token; the admin surfaces are theirs alone, so there is
 * no tenant picker to get wrong.
 */
export function useActingTenant(): string | null {
  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    setTenantId(readSession()?.tenantId ?? null);
  }, []);
  return tenantId;
}
