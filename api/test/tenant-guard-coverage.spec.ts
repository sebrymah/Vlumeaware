import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TENANT_SCOPED_MODELS } from '../src/common/prisma/tenant-guard.extension';

/**
 * Static guard against the failure mode that worries me most: someone adds a
 * model with tenant_id in six months, forgets the extension's allowlist, and
 * ships a table that silently answers cross-tenant queries. No database
 * needed, so it runs in every CI job.
 */
describe('tenant guard coverage', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(
    ([, name, body]) => ({ name, body }),
  );

  it('parses the schema', () => {
    expect(models.length).toBeGreaterThan(5);
  });

  it('guards every model that carries tenant_id', () => {
    // AuditLog carries a tenant_id *filter* column but is a global, append-only
    // table written via runAsSystem — deliberately not a per-tenant boundary.
    const GLOBAL_WITH_TENANT_FILTER = new Set(['AuditLog']);
    const withTenantId = models
      .filter((m) => /@map\("tenant_id"\)/.test(m.body))
      .map((m) => m.name)
      .filter((name) => !GLOBAL_WITH_TENANT_FILTER.has(name))
      .sort();

    expect(withTenantId).toEqual([...TENANT_SCOPED_MODELS].sort());
  });

  it('does not claim to guard models without tenant_id', () => {
    for (const name of TENANT_SCOPED_MODELS) {
      const model = models.find((m) => m.name === name);
      expect(model).toBeDefined();
      expect(model!.body).toMatch(/@map\("tenant_id"\)/);
    }
  });

  it('keeps global models out of the allowlist', () => {
    // Vlumetech staff, tenants themselves and the audit log are global by
    // design. If one of these ever gets scoped, that is a deliberate change.
    for (const global of ['User', 'Tenant', 'AuditLog']) {
      expect(TENANT_SCOPED_MODELS.has(global)).toBe(false);
    }
  });

  it('never stores raw submitted credentials', () => {
    // Context doc §13 flags this as legally sensitive. The schema must hold a
    // boolean and nothing else.
    expect(schema).toMatch(/credentials_submitted/);
    expect(schema).not.toMatch(/submitted_password|credential_value|captured_password/);

    // Metadata-only credential capture (§13, legal-cleared): the submission
    // table may hold lengths, booleans and timings, but never the typed value.
    const submissionModel = schema.match(/model CredentialSubmission\s*\{([\s\S]*?)^\}/m);
    expect(submissionModel).not.toBeNull();
    const body = submissionModel![1];
    expect(body).not.toMatch(/password\s+String|username\s+String|value\s+String|plaintext|secret/i);
    expect(body).toMatch(/usernameLength\s+Int/);
    expect(body).toMatch(/passwordLength\s+Int/);
  });
});
