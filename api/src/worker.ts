import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Worker container entrypoint. Same modules, no HTTP listener — the BullMQ
 * processors registered by QueueModule are what run here.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  new Logger('worker').log('Vlumeaware send worker started');
}

void bootstrap();
