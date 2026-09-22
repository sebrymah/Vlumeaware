'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { readSession } from '@/lib/session';

interface TrialAccess {
  level: 'full' | 'trial' | 'readonly' | 'suspended' | 'offboarded';
  daysLeft: number | null;
  approved: boolean;
  licenseTier: string | null;
}

/**
 * A slim status strip shown to client users while their account is on the free
 * trial or awaiting approval. Silent for full (approved) accounts.
 */
export function TrialBanner() {
  const [access, setAccess] = useState<TrialAccess | null>(null);

  useEffect(() => {
    const s = readSession();
    if (!s?.tenantId || s.role === 'vlumetech_superadmin') return;
    api
      .get<TrialAccess>(`/tenants/${s.tenantId}/trial`)
      .then(setAccess)
      .catch(() => setAccess(null));
  }, []);

  if (!access || access.level === 'full') return null;

  const styles: Record<string, string> = {
    trial: 'border-brand-200 bg-brand-50 text-brand-700',
    readonly: 'border-amber-200 bg-amber-50 text-amber-700',
    suspended: 'border-red-200 bg-red-50 text-red-700',
    offboarded: 'border-red-200 bg-red-50 text-red-700',
  };

  const message =
    access.level === 'trial'
      ? `Free trial — ${access.daysLeft} day${access.daysLeft === 1 ? '' : 's'} left. You can set up your workspace and add up to 20 employees. Live campaigns unlock once Vlumetech approves your account.`
      : access.level === 'readonly'
        ? 'Your free trial has ended and is awaiting Vlumetech approval. The account is read-only until then.'
        : `Account is ${access.level}. Contact Vlumetech.`;

  // Only offer the key where entering one would actually change something.
  const canActivate = access.level === 'trial' || access.level === 'readonly';

  return (
    <div className={`border-b px-6 py-2 text-center text-xs ${styles[access.level]}`}>
      {message}
      {canActivate && (
        <>
          {' '}
          <Link href="/client/license" className="font-semibold underline">
            Have a license key?
          </Link>
        </>
      )}
    </div>
  );
}
