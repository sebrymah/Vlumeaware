import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];

async function bootstrap() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if ((process.env.JWT_SECRET as string).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

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
  new Logger('bootstrap').log(
    `Vlumeaware API on :${port} | mailer=${process.env.MAILER ?? 'log'} | claude=${
      process.env.ANTHROPIC_API_KEY ? 'live' : 'disabled'
    }`,
  );
}

void bootstrap();
