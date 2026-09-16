'use client';

import { PortalLogin } from '@/components/portal-login';

/** Vlumetech staff portal — super-admin only, separate from the client portal. */
export default function StaffLoginPage() {
  return (
    <PortalLogin
      allow={['vlumetech_superadmin']}
      title="Vlumetech staff sign in"
      subtitle="Internal console — Vlumetech LTD"
      otherPortalLabel="client portal"
    />
  );
}
