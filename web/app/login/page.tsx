'use client';

import { PortalLogin } from '@/components/portal-login';

/** Client portal — for client_admin and client_viewer accounts. */
export default function ClientLoginPage() {
  return (
    <PortalLogin
      allow={['client_admin', 'client_viewer']}
      title="Client sign in"
      subtitle="Phishing simulation and security awareness — Vlumetech LTD"
      otherPortalLabel="Vlumetech staff portal"
      showSignup
    />
  );
}
