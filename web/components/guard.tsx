'use client';

import { useRouter, usePathname } from 'next/navigation';
import { LogoMark } from '@/components/logo';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clearSession, homeFor, loginPathFor, loginPathForAllowed, readSession, type Role, type Session } from '@/lib/session';
import { TrialBanner } from '@/components/trial-banner';
import { Icon } from '@/components/icons';

type NavLink = { href: string; label: string };
type NavEntry =
  | { kind: 'link'; href: string; label: string; icon: string }
  | { kind: 'group'; label: string; icon: string; items: NavLink[] };

const NAV: Record<Role, NavEntry[]> = {
  vlumetech_superadmin: [
    { kind: 'link', href: '/super-admin', label: 'Clients', icon: 'building' },
    { kind: 'link', href: '/super-admin/scenarios', label: 'Scenarios', icon: 'hook' },
    { kind: 'link', href: '/super-admin/library', label: 'Shared library', icon: 'film' },
    { kind: 'link', href: '/super-admin/quiz-library', label: 'Quiz library', icon: 'grad' },
    { kind: 'link', href: '/super-admin/audit', label: 'Audit log', icon: 'list' },
    { kind: 'link', href: '/super-admin/security', label: 'Security', icon: 'shield' },
  ],
  client_admin: [
    // First, because a new admin needs it before anything else in this list.
    { kind: 'link', href: '/docs', label: 'Setup guide', icon: 'list' },
    {
      kind: 'group',
      label: 'Phishing',
      icon: 'hook',
      items: [
        { href: '/client', label: 'Campaigns' },
        { href: '/client/scenarios', label: 'Scenarios' },
        { href: '/client/templates', label: 'Templates' },
      ],
    },
    {
      kind: 'group',
      label: 'Training',
      icon: 'grad',
      items: [
        { href: '/client/content', label: 'Awareness content' },
        { href: '/client/quizzes', label: 'Quizzes' },
        { href: '/client/routing', label: 'Training after a click' },
      ],
    },
    {
      kind: 'group',
      label: 'People',
      icon: 'users',
      items: [
        { href: '/client/employees', label: 'Employees' },
        { href: '/client/domains', label: 'Domains' },
        { href: '/client/sending-domains', label: 'Sending domains' },
        { href: '/client/risk', label: 'Risk' },
      ],
    },
    {
      kind: 'group',
      label: 'Reporting',
      icon: 'chart',
      items: [
        { href: '/client/certificates', label: 'Certificates' },
        { href: '/client/reported', label: 'Phish reports' },
      ],
    },
    { kind: 'link', href: '/client/settings', label: 'Branding', icon: 'sparkles' },
    { kind: 'link', href: '/client/license', label: 'License', icon: 'award' },
    { kind: 'link', href: '/client/security', label: 'Security', icon: 'shield' },
  ],
  client_viewer: [
    { kind: 'link', href: '/docs', label: 'Setup guide', icon: 'list' },
    { kind: 'link', href: '/dashboard', label: 'Reporting', icon: 'chart' },
    { kind: 'link', href: '/client/risk', label: 'Risk', icon: 'shield' },
    { kind: 'link', href: '/client/certificates', label: 'Certificates', icon: 'award' },
    { kind: 'link', href: '/client/reported', label: 'Phish reports', icon: 'flag' },
  ],
};

function useIsActive(pathname: string | null) {
  return (href: string) =>
    href === '/client' || href === '/super-admin' || href === '/dashboard'
      ? pathname === href
      : !!pathname && pathname.startsWith(href);
}

const TOP_ITEM =
  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500';
const ON = 'bg-brand-50 text-brand-700';
const OFF = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';

/**
 * Desktop nav. Groups open on click or Enter/Space (not hover), close on
 * Escape, outside click, or choosing a page, and expose aria-expanded so touch
 * and keyboard users can reach every page.
 */
function NavBar({ role, pathname }: { role: Role; pathname: string | null }) {
  const isActive = useIsActive(pathname);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => setOpenGroup(null), [pathname]);

  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenGroup(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openGroup]);

  return (
    <nav ref={navRef} aria-label="Main" className="flex items-center gap-1">
      {NAV[role].map((entry) =>
        entry.kind === 'link' ? (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={isActive(entry.href) ? 'page' : undefined}
            className={`${TOP_ITEM} ${isActive(entry.href) ? ON : OFF}`}
          >
            <Icon name={entry.icon} className="h-4 w-4" />
            {entry.label}
          </Link>
        ) : (
          <div key={entry.label} className="relative">
            <button
              type="button"
              aria-expanded={openGroup === entry.label}
              aria-haspopup="true"
              onClick={() => setOpenGroup((g) => (g === entry.label ? null : entry.label))}
              className={`${TOP_ITEM} ${entry.items.some((i) => isActive(i.href)) ? ON : OFF}`}
            >
              <Icon name={entry.icon} className="h-4 w-4" />
              {entry.label}
              <Icon
                name="chevron"
                className={`h-3 w-3 opacity-60 transition ${openGroup === entry.label ? 'rotate-180' : ''}`}
              />
            </button>
            {openGroup === entry.label && (
              <div className="absolute left-0 top-full z-30 min-w-[190px] pt-1.5">
                <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-pop">
                  {entry.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={`block rounded-lg px-3 py-2 text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
                        isActive(item.href)
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ),
      )}
    </nav>
  );
}

/**
 * Phone nav. Hover menus cannot work on touch, so every page is shown as one
 * flat, horizontally scrolling row of links. Phase 2 replaces this with a
 * bottom tab bar.
 */
function MobileNav({ role, pathname }: { role: Role; pathname: string | null }) {
  const isActive = useIsActive(pathname);
  const links = NAV[role].flatMap((e) =>
    e.kind === 'link' ? [{ href: e.href, label: e.label }] : e.items,
  );
  return (
    <nav aria-label="Main" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(l.href) ? 'page' : undefined}
          className={`${TOP_ITEM} shrink-0 whitespace-nowrap ${isActive(l.href) ? ON : OFF}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Client-side route gate. The API enforces the same boundaries independently —
 * this only decides what to render, and a tampered localStorage role gets 403s
 * from every call it tries to make.
 */
export function Guard({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
    return <div role="status" aria-live="polite" className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>;
  }
  if (session === null) return null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-5 px-6">
          <Link href={homeFor(session.role)} className="text-[15px] font-extrabold tracking-tight text-slate-900">
            <LogoMark size={18} className="mr-1.5 inline-block align-[-3px]" />
            Vlume<span className="text-brand-600">aware</span>
          </Link>
          <div className="hidden md:block">
            <NavBar role={session.role} pathname={pathname} />
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="hidden text-slate-500 sm:block">{session.email}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
              {session.role.replace('vlumetech_', '').replace('client_', '')}
            </span>
            <button
              onClick={() => {
                const dest = loginPathFor(session.role);
                clearSession();
                router.replace(dest);
              }}
              className="rounded-lg px-2.5 py-1 font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
        {/* mobile nav */}
        <div className="border-t border-slate-100 px-4 py-2 md:hidden">
          <MobileNav role={session.role} pathname={pathname} />
        </div>
      </header>
      {session.role !== 'vlumetech_superadmin' && <TrialBanner />}
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

export function useActingTenant(): string | null {
  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    setTenantId(readSession()?.tenantId ?? null);
  }, []);
  return tenantId;
}
