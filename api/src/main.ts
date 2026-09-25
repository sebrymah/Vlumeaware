import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { applyPendingMigrations } from './common/prisma/migrate-on-boot';
import { PrismaService } from './common/prisma/prisma.service';
import { assertSchemaIsCurrent } from './common/prisma/schema-guard';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];

/**
 * How many reverse proxies sit in front of this process.
 *
 * Express only honours X-Forwarded-For when it is told to, so with this unset
 * `req.ip` is the proxy's address rather than the caller's. On Render that made
 * every request in the world share one rate-limit bucket: the 10/min login
 * limit became a global 10/min, and five failed attempts by anyone locked the
 * account out for everybody.
 *
 * It must be the EXACT hop count, never `true`. Trusting every hop lets a
 * client set its own X-Forwarded-For and rotate the rate-limit key at will,
 * which is worse than the bug it fixes. Render terminates TLS at one proxy.
 * Override with TRUST_PROXY when the topology differs; 0 disables it (correct
 * when something else, such as a Cloudflare tunnel, already sets req.ip).
 */
function trustProxyHops(): number {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === '') return 1;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
    throw new Error(`TRUST_PROXY must be an integer between 0 and 10, got ${JSON.stringify(raw)}`);
  }
  return hops;
}

async function bootstrap() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if ((process.env.JWT_SECRET as string).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const hops = trustProxyHops();
  if (hops > 0) app.getHttpAdapter().getInstance().set('trust proxy', hops);

  // Schema first, then traffic. Migrations run at boot by default (serialised
  // by Prisma's own Postgres advisory lock, so they are safe behind more than
  // one instance), and the check afterwards is the second opinion: it catches a
  // half-applied migration and a database that is behind the image.
  await applyPendingMigrations();
  await assertSchemaIsCurrent(app.get(PrismaService));

  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  const aiKey = process.env.DEEPSEEK_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  const aiProvider =
    (process.env.AI_PROVIDER ?? '').toLowerCase() ||
    (process.env.DEEPSEEK_API_KEY ? 'deepseek' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'none');
  new Logger('bootstrap').log(
    `Vlumeaware API on :${port} | mailer=${process.env.MAILER ?? 'log'} | ai=${
      aiKey ? aiProvider : 'disabled'
    } | trustProxy=${hops}`,
  );
}

void bootstrap();
