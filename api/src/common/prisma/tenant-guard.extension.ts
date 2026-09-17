import { Prisma } from '@prisma/client';
import { currentScope, TenantScopeError } from './tenant-context';

/**
 * Models carrying tenant_id. Anything in this set is unreachable without a
 * tenant in the async context. `User` (Vlumetech staff), `Tenant` itself and
 * `AuditLog` are intentionally absent — they are global by design.
 *
 * test/tenant-guard-coverage.spec.ts fails the build if a model gains a
 * tenant_id column without being listed here.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'TenantUser',
  'Employee',
  'Scenario',
  'Campaign',
  'CampaignScenario',
  'Send',
  'TrainingRoutingRule',
  'TrainingAssignment',
  'Report',
  'CredentialSubmission',
  'TrainingModule',
  'Quiz',
  'QuizQuestion',
  'QuizAttempt',
  'Certificate',
  'PhishReport',
  'VerifiedDomain',
]);

/** Operations whose `where` must be narrowed to the current tenant. */
const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

const CREATE_OPS = new Set(['create', 'createMany', 'upsert']);

/**
 * Narrows a `where` clause to the acting tenant.
 *
 * The tenant filter goes at the *top level* rather than inside an `AND`
 * wrapper: Prisma ANDs top-level keys, so the filtering effect is identical,
 * and unlike a wrapper it leaves intact the unique field that `update`,
 * `delete` and `findUnique` require at the top level of `where`.
 *
 * If the caller supplied a tenantId of their own and it is not theirs, the
 * clause is kept as an extra AND term so the query matches nothing. Dropping
 * it instead would silently answer a question about the acting tenant that the
 * caller asked about a different one — safe, but misleading. Fail closed.
 */
function scopeWhere(where: unknown, tenantId: string): Record<string, unknown> {
  if (!where || typeof where !== 'object') return { tenantId };

  const rest = { ...(where as Record<string, unknown>) };
  const supplied = rest.tenantId;
  delete rest.tenantId;

  const scoped: Record<string, unknown> = { ...rest, tenantId };

  if (supplied !== undefined && supplied !== tenantId) {
    const existing = rest.AND;
    const preserved = Array.isArray(existing) ? existing : existing ? [existing] : [];
    scoped.AND = [...preserved, { tenantId: supplied }];
  }

  return scoped;
}

/**
 * Prisma client extension enforcing multi-tenancy at the query layer rather
 * than in application code. A tenant-scoped query issued with no tenant in the
 * async context throws instead of returning cross-tenant rows.
 */
export const tenantGuardExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'tenantGuard',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const scope = currentScope();
          if (scope?.system) {
            return query(args);
          }
          if (!scope?.tenantId) {
            throw new TenantScopeError(
              `Blocked unscoped ${operation} on ${model}: no tenant in async context.`,
            );
          }

          const tenantId = scope.tenantId;
          const next = { ...(args as Record<string, any>) };

          if (WHERE_OPS.has(operation)) {
            next.where = scopeWhere(next.where, tenantId);
          }

          if (CREATE_OPS.has(operation)) {
            if (operation === 'createMany') {
              const rows = Array.isArray(next.data) ? next.data : [next.data];
              next.data = rows.map((row: Record<string, unknown>) => ({ ...row, tenantId }));
            } else if (operation === 'upsert') {
              next.create = { ...next.create, tenantId };
            } else {
              next.data = { ...next.data, tenantId };
            }
          }

          // A write must never be able to move a row to another tenant.
          if (operation === 'update' || operation === 'updateMany' || operation === 'upsert') {
            const key = operation === 'upsert' ? 'update' : 'data';
            const payload = next[key];
            if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
              const data = { ...payload } as Record<string, unknown>;
              if ('tenantId' in data && data.tenantId !== tenantId) {
                throw new TenantScopeError(
                  `Blocked ${operation} on ${model}: attempted tenant reassignment.`,
                );
              }
              delete data.tenantId;
              next[key] = data;
            }
          }

          return query(next);
        },
      },
    },
  }),
);
