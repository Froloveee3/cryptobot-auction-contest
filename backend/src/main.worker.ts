import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';


async function bootstrapWorker(): Promise<void> {
  process.env.APP_MODE = process.env.APP_MODE || 'worker';
  const logger = new Logger('WorkerBootstrap');
  await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  logger.log('Worker context started (no HTTP listener).');
}

bootstrapWorker().catch((error: Error) => {
  // eslint-disable-next-line no-console
  console.error('Error starting worker:', error);
  process.exit(1);
});

