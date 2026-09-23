import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Security headers + Content-Security-Policy (Security review R3).
 *
 * The public, attacker-reachable pages — the teachable-moment and
 * simulated-login pages under /t/* — are dynamically rendered, so they get a
 * strict, per-request NONCE policy: script-src 'self' 'nonce-…' 'strict-dynamic'
 * with NO 'unsafe-inline'. Next nonces its own scripts, and scripts they load
 * inherit trust; any injected inline script or on* handler is refused.
 *
 * The authenticated console pages are statically prerendered, which is
 * incompatible with a per-request nonce, so they get a still-hardened policy
 * that keeps 'unsafe-inline' only for scripts. They are not the XSS surface the
 * review flags (no untrusted HTML is rendered there without sanitization).
 */
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').origin;
  } catch {
    return '';
  }
}

export function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV !== 'production';
  const api = apiOrigin();
  const p = request.nextUrl.pathname;
  const isPublic = p.startsWith('/t/') || p.startsWith('/learn/') || p.startsWith('/portal');
  const nonce = btoa(crypto.randomUUID());

  const common = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `form-action 'self'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' blob: https:`,
    `connect-src 'self' ${api} https://*.supabase.co${dev ? ' ws:' : ''}`.trim(),
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ];

  const scriptSrc = isPublic
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`
    : `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`;

  const csp = [scriptSrc, ...common].join('; ');

  const requestHeaders = new Headers(request.headers);
  if (isPublic) {
    // Next reads the nonce from the request CSP header and applies it to its scripts.
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('content-security-policy', csp);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|txt|woff2?)$).*)',
    },
  ],
};
