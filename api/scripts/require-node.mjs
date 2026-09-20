/**
 * Jest runs the suite through its own module registry rather than Node's
 * require, and that registry can only load an ESM dependency on Node 24.9 or
 * newer. @nestjs/common is ESM from v12, so on an older Node every suite that
 * imports it fails to load — ten of thirteen here — with an error about ES
 * modules that says nothing about the Node version being the cause.
 *
 * The application itself is unaffected and still ships on node:22-slim: plain
 * Node has been able to require ESM since 22.12. This is a test-tooling
 * requirement only, which is why it is enforced here and not in "engines",
 * where it would make the production image's npm ci complain.
 */
const [major, minor] = process.versions.node.split('.').map(Number);

if (major < 24 || (major === 24 && minor < 9)) {
  console.error(
    `\nThe test suite needs Node >= 24.9 — this is ${process.version}.\n` +
      `Jest cannot load @nestjs/common (ESM) on older Node, and every suite that\n` +
      `imports it will fail to run with a misleading "Must use import" error.\n\n` +
      `  nvm use        # picks up .nvmrc at the repo root\n` +
      `  nvm install 24 # if it is not installed yet\n`,
  );
  process.exit(1);
}
