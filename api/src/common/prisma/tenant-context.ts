import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantScope {
  /** Tenant every query in this async context is confined to. */
  tenantId?: string;
  /** Deliberate cross-tenant escape hatch. Superadmin + token lookups only. */
  system?: boolean;
  /** Why scoping was bypassed. Recorded for audit. */
  systemReason?: string;
  /** Set on the request for audit trails. */
  actorId?: string;
  actorRole?: string;
}

type Actor = Pick<TenantScope, 'actorId' | 'actorRole'>;

const storage = new AsyncLocalStorage<TenantScope>();

export class TenantScopeError extends Error {}

/**
 * Prisma promises are lazy: the query only runs when it is awaited. If the
 * promise were created inside the scope and awaited outside it, the tenant
 * filter would be missing at execution time. So the async helpers below always
 * await inside the scope, and callers get back a plain Promise.
 */
export function runInTenant<T>(
  tenantId: string,
  fn: () => T | Promise<T>,
  actor: Actor = {},
): Promise<T> {
  if (!tenantId) throw new TenantScopeError('runInTenant requires a tenantId');
  return storage.run({ tenantId, ...actor }, async () => fn());
}

/**
 * Escape tenant scoping. Only for vlumetech_superadmin cross-tenant views and
 * for public tracking-token lookups, which must resolve a tenant before they
 * know one.
 */
export function runAsSystem<T>(
  reason: string,
  fn: () => T | Promise<T>,
  actor: Actor = {},
): Promise<T> {
  return storage.run({ system: true, systemReason: reason, ...actor }, async () => fn());
}

/**
 * Synchronous variants. Only for request-lifecycle plumbing that must hand
 * back a non-promise (a Nest interceptor returning an Observable). The callback
 * must start its work synchronously so it inherits the scope.
 */
export function runInTenantSync<T>(tenantId: string, fn: () => T, actor: Actor = {}): T {
  if (!tenantId) throw new TenantScopeError('runInTenantSync requires a tenantId');
  return storage.run({ tenantId, ...actor }, fn);
}

export function runAsSystemSync<T>(reason: string, fn: () => T, actor: Actor = {}): T {
  return storage.run({ system: true, systemReason: reason, ...actor }, fn);
}

export function currentScope(): TenantScope | undefined {
  return storage.getStore();
}

export function currentTenantId(): string {
  const scope = storage.getStore();
  if (!scope?.tenantId) {
    throw new TenantScopeError(
      'No tenant in async context. Wrap the call in runInTenant() or runAsSystem().',
    );
  }
  return scope.tenantId;
}
