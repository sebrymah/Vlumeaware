'use client';

import { clearSession, readSession } from './session';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession();
  const headers = new Headers(init.headers);
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    // The token is gone or expired; drop it so the app returns to login
    // rather than looping on a dead session.
    clearSession();
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? message);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

export interface LoginResponse {
  accessToken?: string;
  role?: string;
  tenantId?: string;
  /** MFA is active: exchange `mfaChallenge` + a code at verifyMfa(). */
  mfaRequired?: boolean;
  mfaChallenge?: string;
  /** Signed-in staff must still enrol in MFA. */
  mfaEnrollmentRequired?: boolean;
}

async function authPost(path: string, body: unknown): Promise<LoginResponse> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) throw new ApiError(429, 'Too many attempts. Wait a minute and try again.');
    let message = 'Invalid credentials.';
    try {
      const b = await res.json();
      message = Array.isArray(b.message) ? b.message.join(', ') : (b.message ?? message);
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as LoginResponse;
}

export function login(email: string, password: string) {
  return authPost('/auth/login', { email, password });
}

/** Second factor: exchange the login challenge + a 6-digit code for an access token. */
export function verifyMfa(challenge: string, code: string) {
  return authPost('/auth/mfa/verify', { challenge, code });
}

/** Public endpoint — no session, used by the teachable-moment page. */
export async function fetchTeachableMoment(token: string) {
  const res = await fetch(`${BASE}/track/moment/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}
