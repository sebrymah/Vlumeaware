import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Security review R12 — static, DB-free guard that fails the build if the
 * credential-capture path ever gains a way to persist a typed secret. Runs in
 * any environment (no database needed), unlike the behavioural spec.
 */
const ROOT = join(__dirname, '..');
const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const service = readFileSync(
  join(ROOT, 'src', 'modules', 'tracking', 'tracking.service.ts'),
  'utf8',
);

// Fields the CredentialSubmission model is allowed to have. Anything else — and
// in particular a plaintext value column — must fail the build.
const ALLOWED_FIELDS = new Set([
  'id',
  'tenantId',
  'sendId',
  'usernameLength',
  'passwordLength',
  'usernameLooksLikeEmail',
  'timeToSubmitMs',
  'submittedAt',
  'tenant',
  'send',
]);

const FORBIDDEN = /\b(password|username|secret|credential|plaintext|value)\b/i;

describe('R12 · credential capture cannot persist a secret (static)', () => {
  it('the CredentialSubmission model has only non-reversible fields', () => {
    const m = schema.match(/model\s+CredentialSubmission\s*\{([\s\S]*?)^\}/m);
    expect(m).not.toBeNull();
    const body = m![1];
    const fields = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('///') && !l.startsWith('@@'))
      .map((l) => l.split(/\s+/)[0]);

    for (const f of fields) {
      expect(ALLOWED_FIELDS.has(f)).toBe(true);
      // a field literally named password/username/value/secret is forbidden,
      // while *Length / *LooksLikeEmail metadata is fine.
      if (/^(password|username)$/i.test(f) || /^(value|secret|credential)$/i.test(f)) {
        throw new Error(`Forbidden plaintext field on CredentialSubmission: ${f}`);
      }
    }
  });

  it('the submission handler never reads a typed username/password value', () => {
    // e.g. metadata.password (but metadata.passwordLength is fine)
    expect(/metadata\.password(?!Length)/.test(service)).toBe(false);
    expect(/metadata\.username(?!Length|LooksLikeEmail)/.test(service)).toBe(false);
  });

  it('the credentialSubmission.create binds only allowlisted keys', () => {
    const call = service.match(/credentialSubmission\.create\(\s*\{([\s\S]*?)\}\s*\)/);
    expect(call).not.toBeNull();
    const dataBlock = call![1];
    const keys = [...dataBlock.matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
    for (const k of keys) {
      if (FORBIDDEN.test(k) && !/Length$|LooksLikeEmail$/.test(k)) {
        throw new Error(`Suspicious key in credentialSubmission.create: ${k}`);
      }
    }
  });
});
