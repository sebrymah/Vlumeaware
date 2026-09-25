process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-000000';
process.env.DATABASE_URL ??=
  'postgresql://vlumeaware:vlumeaware@localhost:5433/vlumeaware_test?schema=public';
process.env.MAILER = '';
process.env.ANTHROPIC_API_KEY = '';

// The documented dev setup starts Redis alongside Postgres (`docker compose up
// -d postgres postgres-test redis`), so point the suite at it by default: the
// rate-limit store is Redis-backed whenever Redis is configured, and those
// cases should run rather than skip. With Redis down they warn loudly and skip;
// CI sets REQUIRE_REDIS_TESTS=1, which turns that skip into a failure.
process.env.REDIS_HOST ??= '127.0.0.1';

// Domains, set here rather than inherited.
//
// The suite must be self-contained. @prisma/client loads `.env` into process.env
// when it is imported, so a variable that lives only in `api/.env` is present
// when a developer runs the suite locally and absent in CI, where `.env` is
// gitignored. That is exactly what happened: the preflight gate
// `trackingConfigured` reads TRACKING_BASE_URL, so "launches when every gate is
// green" passed locally and failed the first time CI ran.
//
// Anything the application reads that a test depends on belongs here.
process.env.TRACKING_BASE_URL ??= 'http://localhost:3001';
process.env.PUBLIC_WEB_URL ??= 'http://localhost:3000';
