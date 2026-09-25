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
