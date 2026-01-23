import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression') as typeof import('compression');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { MetricsService } from './metrics/metrics.service';
import { AppLoggerService } from './common/services/logger.service';

async function bootstrap(): Promise<void> {
  process.env.APP_MODE = process.env.APP_MODE || 'api';
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api');
  const corsOriginRaw = (configService.get<string>('CORS_ORIGIN') ?? '*').trim();

  
  app.use(helmet());
  app.use(compression());

  
  app.use(requestIdMiddleware);

  
  
  
  
  
  if (nodeEnv === 'production' && corsOriginRaw === '*') {
    throw new Error('CORS_ORIGIN must be set to an allowlist in production (not "*")');
  }
  if (nodeEnv === 'production' && (corsOriginRaw === '' || corsOriginRaw.toLowerCase() === 'false')) {
    throw new Error('CORS_ORIGIN must be set in production (cannot be empty/false)');
  }

  const corsOrigin =
    corsOriginRaw === '*'
      ? true
      : corsOriginRaw === '' || corsOriginRaw.toLowerCase() === 'false'
        ? false
        : corsOriginRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix(apiPrefix);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter (stable API error shape)
  const loggerService = await app.resolve(AppLoggerService);
  const metricsService = app.get(MetricsService);
  app.useGlobalFilters(new HttpExceptionFilter(loggerService, metricsService));

  // Global HTTP logging (requestId/method/path/status/duration)
  app.useGlobalInterceptors(new HttpLoggingInterceptor(app.get(MetricsService), loggerService));

  
  const config = new DocumentBuilder()
    .setTitle('Auction API')
    .setDescription('Backend API for Telegram Gift Auctions-like system')
    .setVersion('1.0')
    .addTag('auctions')
    .addTag('users')
    .addTag('bids')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger documentation: http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap().catch((error: Error) => {
  // eslint-disable-next-line no-console
  console.error('Error starting application:', error);
  process.exit(1);
});
