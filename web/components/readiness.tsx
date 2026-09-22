'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui';

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  hint: string;
  href: string | null;
}

export interface Readiness {
  ready: boolean;
  outstanding: number;
  checks: ReadinessCheck[];
}

/**
 * Setup checklist for a client who has not finished onboarding.
 *
 * Renders nothing once everything is green, so it disappears rather than
 * becoming furniture. The gateway allow-list is the reason this exists: it
 * needs the client's own IT team and has a lead time measured in days, and
 * before this the only place it appeared was a page nobody was pointed at.
 */
export function ReadinessChecklist({ tenantId }: { tenantId: string | null }) {
  const [state, setState] = useState<Readiness | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setState(await api.get<Readiness>(`/tenants/${tenantId}/readiness`));
    } catch {
      // A checklist that cannot load must not break the page it sits on.
      setState(null);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state || state.ready) return null;

  return (
    <Card
      title="Finish setting up"
      subtitle={`${state.outstanding} thing${state.outstanding === 1 ? '' : 's'} left before you can launch a campaign.`}
    >
      <ul className="space-y-3">
        {state.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${
                c.ok ? 'bg-brand-600 text-white' : 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200'
              }`}
              aria-hidden
            >
              {c.ok ? '✓' : '!'}
            </span>
            <div className="min-w-0">
              <p className={`text-[13px] font-medium ${c.ok ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                {c.label}
              </p>
              {!c.ok && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  {c.hint}
                  {c.href && (
                    <>
                      {' '}
                      <Link href={c.href} className="font-medium text-brand-700 underline">
                        Open
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
