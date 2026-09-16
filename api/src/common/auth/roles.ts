export const ROLES = {
  superadmin: 'vlumetech_superadmin',
  clientAdmin: 'client_admin',
  clientViewer: 'client_viewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Absent for vlumetech_superadmin, who is not bound to one tenant. */
  tenantId?: string;
}
