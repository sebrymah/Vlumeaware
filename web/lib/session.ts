'use client';

export type Role = 'vlumetech_superadmin' | 'client_admin' | 'client_viewer';

export interface Session {
  accessToken: string;
  role: Role;
  tenantId?: string;
  email: string;
}

const KEY = 'vlumeaware.session';

export function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    window.localStorage.removeItem(KEY);
    return null;
  }
}

export function writeSession(session: Session) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
}

/** Landing route for a role, matching the API's own role boundaries. */
export function homeFor(role: Role): string {
  if (role === 'vlumetech_superadmin') return '/super-admin';
  if (role === 'client_admin') return '/client';
  return '/dashboard';
}

/**
 * The sign-in URL a role belongs to. Vlumetech staff have their own portal,
 * separate from the client portal — two distinct entry points.
 */
export function loginPathFor(role: Role): string {
  return role === 'vlumetech_superadmin' ? '/admin' : '/login';
}

/** The login URL a route guard should send an unauthenticated visitor to. */
export function loginPathForAllowed(allow: Role[]): string {
  return allow.length === 1 && allow[0] === 'vlumetech_superadmin' ? '/admin' : '/login';
}
