process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-000000';
process.env.DATABASE_URL ??=
  'postgresql://vlumeaware:vlumeaware@localhost:5433/vlumeaware_test?schema=public';
process.env.MAILER = '';
process.env.ANTHROPIC_API_KEY = '';
