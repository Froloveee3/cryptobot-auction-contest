import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { MetricsService } from '../../metrics/metrics.service';
import { AppLoggerService } from '../services/logger.service';
import { getRequestIdFromContext } from '../utils/logger-context.helper';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const start = Date.now();
    const requestId = getRequestIdFromContext(context) || (req as any).requestId || req.header('x-request-id');
    const path = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.originalUrl || req.url;

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          const status = String(res.statusCode);
          this.metrics.httpRequestsTotal.labels(req.method, path, status).inc();
          this.metrics.httpRequestDurationMs.labels(req.method, path, status).observe(ms);
          
          this.logger.log(`${req.method} ${path} ${res.statusCode}`, {
            requestId,
            method: req.method,
            path,
            statusCode: res.statusCode,
            durationMs: ms,
          });
        },
        error: () => {
          const ms = Date.now() - start;
          const status = String(res.statusCode || 500);
          this.metrics.httpRequestsTotal.labels(req.method, path, status).inc();
          this.metrics.httpRequestDurationMs.labels(req.method, path, status).observe(ms);
          
          this.logger.warn(`${req.method} ${path} ${res.statusCode}`, {
            requestId,
            method: req.method,
            path,
            statusCode: res.statusCode,
            durationMs: ms,
          });
        },
      }),
    );
  }
}

