'use client';

export type Role = 'vlumetech_superadmin' | 'client_admin' | 'client_viewer';

export interface Session {
  accessToken: string;
  role: Role;
  tenantId?: string;
  email: string;
}

const KEY = 'vlumeaware.session';

/**
 * Expiry of the token, in epoch milliseconds. The JWT carries `exp`; reading it
 * locally lets the app end a session at the moment it expires instead of
 * discovering it on the next failed request.
 */
export function sessionExpiresAt(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Milliseconds until the session expires. Negative when it already has. */
export function sessionRemainingMs(token: string): number | null {
  const at = sessionExpiresAt(token);
  return at === null ? null : at - Date.now();
}

/**
 * The stored session, or null when there is not a usable one.
 *
 * An expired token is treated as no session: keeping it would render the console
 * shell over a session that cannot make a single request, which reads as a broken
 * application rather than a signed-out one.
 */
export function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    const remaining = session.accessToken ? sessionRemainingMs(session.accessToken) : null;
    if (remaining !== null && remaining <= 0) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return session;
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
