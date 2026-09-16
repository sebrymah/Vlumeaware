'use client';

import { useParams } from 'next/navigation';
import { Guard, useActingTenant } from '@/components/guard';
import { CampaignReport } from '@/components/report';

export default function AdminCampaignPage() {
  return (
    <Guard allow={['client_admin']}>
      <Inner />
    </Guard>
  );
}

function Inner() {
  const params = useParams<{ campaignId: string }>();
  const tenantId = useActingTenant();
  if (!tenantId) return <p className="text-sm text-slate-500">Loading…</p>;
  return <CampaignReport tenantId={tenantId} campaignId={params.campaignId} canGenerate />;
}
