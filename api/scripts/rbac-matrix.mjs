#!/usr/bin/env node
/**
 * Generates the role→route→action authorization matrix straight from the
 * controllers, so the access-control policy is documented from the source of
 * truth rather than a hand-maintained spreadsheet (SOC2 CC6.1 / CC6.3).
 *
 * For every HTTP handler it records the route, method, and the roles allowed by
 * the nearest @Roles decorator (method-level overrides class-level). A handler
 * with no @Roles anywhere is flagged as PUBLIC — intended only for the public
 * tracking/portal endpoints; anything else in that column is a finding.
 *
 * Usage:
 *   node scripts/rbac-matrix.mjs           # Markdown table to stdout
 *   node scripts/rbac-matrix.mjs --json    # JSON to stdout
 *   node scripts/rbac-matrix.mjs --out ../docs/soc2/rbac-matrix.md
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const HTTP = ['Get', 'Post', 'Put', 'Patch', 'Delete'];

/** Recursively list *.controller.ts files. */
function controllers(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...controllers(p));
    else if (name.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

const rolesIn = (s) =>
  [...s.matchAll(/ROLES\.(\w+)/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);

/** Replace comments with a space so a JSDoc block between decorators does not
 *  break the contiguous decorator run the parser looks for. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const rows = [];
for (const file of controllers(SRC)) {
  const src = stripComments(readFileSync(file, 'utf8'));

  // Class-level @Controller('base') and class-level @Roles(...).
  const base = (src.match(/@Controller\(\s*['"]([^'"]*)['"]/) ?? [, ''])[1];
  const classRolesMatch = src.match(/@Roles\(([^)]*)\)\s*(?:@[\w.]+\([^)]*\)\s*)*export class/s);
  const classRoles = classRolesMatch ? rolesIn(classRolesMatch[1]) : [];
  const classPublic = /@Public\(\)\s*(?:@[\w.]+\([^)]*\)\s*)*export class/s.test(src);

  // Each method: the decorator block immediately preceding a method signature.
  // Tolerates an `async` (or other) modifier between the decorators and the name.
  const methodRe =
    /((?:@[\w.]+\([^)]*\)\s*)+)(?:async\s+)?(\w+)\s*\(/g;
  let m;
  while ((m = methodRe.exec(src))) {
    const decorators = m[1];
    const httpMatch = decorators.match(new RegExp(`@(${HTTP.join('|')})\\(\\s*['"]?([^'")]*)['"]?`));
    if (!httpMatch) continue; // not an HTTP handler
    const method = httpMatch[1].toUpperCase();
    const sub = httpMatch[2] ?? '';
    const isPublic = /@Public\(\)/.test(decorators) || classPublic;
    const methodRoles = /@Roles\(/.test(decorators) ? rolesIn(decorators) : null;
    const roles = methodRoles ?? classRoles;
    const path = '/' + [base, sub].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, '');
    // Access class: UNAUTH (@Public), AUTH_ANY (authenticated, no role gate), or the role list.
    const access = isPublic ? 'UNAUTH' : roles.length ? roles : 'AUTH_ANY';
    rows.push({
      module: file.split('/modules/')[1]?.split('/')[0] ?? file.split('/common/')[1]?.split('/')[0] ?? '—',
      method,
      path,
      access,
    });
  }
}

rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const args = process.argv.slice(2);
if (args.includes('--json')) {
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  process.exit(0);
}

const ROLE_COLS = ['superadmin', 'clientAdmin', 'clientViewer'];
const tick = (r, col) => {
  if (r.access === 'UNAUTH') return '🌐';
  if (r.access === 'AUTH_ANY') return '🔑';
  return r.access.includes(col) ? '✅' : '—';
};
const unauth = rows.filter((r) => r.access === 'UNAUTH');
const lines = [
  '# Vlumeaware — RBAC authorization matrix',
  '',
  `_Generated from the controllers by \`api/scripts/rbac-matrix.mjs\` on ${new Date().toISOString().slice(0, 10)}. Do not hand-edit._`,
  '',
  'Legend: ✅ role allowed · — denied · 🔑 any authenticated user (no role gate) · 🌐 unauthenticated (`@Public`).',
  'Unauthenticated rows are expected only for tracking, learning, portal, intake, signup, health and login endpoints; any other 🌐 row is a finding to review.',
  '',
  '| Method | Route | Module | ' + ROLE_COLS.join(' | ') + ' |',
  '|---|---|---|' + ROLE_COLS.map(() => '---').join('|') + '|',
  ...rows.map(
    (r) =>
      `| ${r.method} | \`${r.path}\` | ${r.module} | ` + ROLE_COLS.map((c) => tick(r, c)).join(' | ') + ' |',
  ),
  '',
  `Total handlers: ${rows.length}. Unauthenticated (\`@Public\`): ${unauth.length}.`,
  '',
  '## Unauthenticated (`@Public`) endpoints — review these deliberately',
  '',
  ...unauth.map((r) => `- ${r.method} \`${r.path}\` (${r.module})`),
  '',
];
const md = lines.join('\n');

const outIdx = args.indexOf('--out');
if (outIdx !== -1 && args[outIdx + 1]) {
  const out = resolve(process.cwd(), args[outIdx + 1]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  process.stderr.write(`Wrote ${rows.length} rows to ${out}\n`);
} else {
  process.stdout.write(md);
}
