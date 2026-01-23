import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../types/domain-errors.types';
import { isMongoError } from '../types/mongodb.types';
import { ErrorDetails } from '../types/error-details.types';
import { AppLoggerService } from '../services/logger.service';
import { getRequestIdFromContext } from '../utils/logger-context.helper';
import { MetricsService } from '../../metrics/metrics.service';

type ApiErrorBody = {
  code: string;
  message: string;
  details?: ErrorDetails;
  path: string;
  timestamp: string;
};

type NestResponse = string | { message?: string | string[]; code?: string; details?: ErrorDetails };

function normalizeMessage(raw: NestResponse | string | string[]): string {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as { message?: string | string[] };
    if (typeof obj.message === 'string') return obj.message;
    if (Array.isArray(obj.message) && obj.message.length > 0) return String(obj.message[0]);
  }
  return 'Unexpected error';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLoggerService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.logger.setContext('ExceptionFilter');
  }

  catch(exception: Error | HttpException | DomainError | string | number | null | undefined, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: ErrorDetails | undefined = undefined;

    
    if (
      exception instanceof Error &&
      (exception as any).__httpStatus &&
      (exception as any).__httpBody
    ) {
      status = (exception as any).__httpStatus;
      const body = (exception as any).__httpBody as any;
      code = body.code || 'BAD_REQUEST';
      message = body.message || 'Request failed';
      details = body.details;
    }
    
    if (exception instanceof DomainError) {
      status = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      
      const responseObj: NestResponse = typeof r === 'object' && r !== null ? r : { message: r };
      message = normalizeMessage(responseObj);
      code =
        typeof (responseObj as { code?: string })?.code === 'string'
          ? (responseObj as { code: string }).code
          : status >= 500
            ? 'INTERNAL_ERROR'
            : 'BAD_REQUEST';
      details = (responseObj as { details?: ErrorDetails })?.details ?? undefined;
    } else if (exception instanceof Error) {
      
      if (isMongoError(exception)) {
        const mongoErr = exception;
        if (
          mongoErr.name === 'CastError' ||
          (typeof exception.message === 'string' &&
            exception.message.includes('Cast to ObjectId failed')) ||
          mongoErr.name === 'BSONError'
        ) {
          status = HttpStatus.BAD_REQUEST;
          code = 'INVALID_ID';
          message = 'Invalid id';
          details = {
            path: (mongoErr as { path?: string })?.path,
            value: (mongoErr as { value?: string | number | null })?.value,
            kind: (mongoErr as { kind?: string })?.kind,
          };
        } else {
          
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          code = 'DATABASE_ERROR';
          message = 'Database error';
        }
      } else {
        
        const m = exception.message || 'Unexpected error';
        message = m;
        if (m === 'Auction not found' || m.includes('not found')) {
          status = HttpStatus.NOT_FOUND;
          code = 'NOT_FOUND';
        } else if (m === 'Insufficient balance') {
          status = HttpStatus.BAD_REQUEST;
          code = 'INSUFFICIENT_BALANCE';
        } else if (m.toLowerCase().includes('write conflict')) {
          status = HttpStatus.CONFLICT;
          code = 'WRITE_CONFLICT';
        } else if (m === 'Round has ended') {
          status = HttpStatus.BAD_REQUEST;
          code = 'ROUND_ENDED';
        } else if (m.startsWith('Bid amount must be at least')) {
          status = HttpStatus.BAD_REQUEST;
          code = 'BID_TOO_LOW';
        } else if (m.startsWith('To increase your bid, you must add at least')) {
          status = HttpStatus.BAD_REQUEST;
          code = 'BID_INCREMENT_TOO_LOW';
        } else if (m.startsWith('Auction can only be started')) {
          status = HttpStatus.BAD_REQUEST;
          code = 'INVALID_AUCTION_STATE';
        } else {
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          code = 'INTERNAL_ERROR';
        }
      }
    }

    const body: ApiErrorBody = {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: req.originalUrl || req.url,
      timestamp: new Date().toISOString(),
    };

    const requestId = getRequestIdFromContext(host) || (req as any).requestId || req.headers['x-request-id'] as string | undefined;
    const logContext = {
      requestId,
      method: req.method,
      path: body.path,
      statusCode: status,
      errorCode: code,
      userId: (req as any).user?.id || (req as any).user?._id,
    };
    
    
    const errorType = exception instanceof Error ? exception.constructor.name : typeof exception;
    const severity = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    this.metrics?.errorsTotal.labels(errorType, code, severity).inc();

    
    
    const isTestEnv = process.env.NODE_ENV === 'test';
    const shouldLog = !isTestEnv || status >= 500;
    
    if (shouldLog) {
      if (status >= 500) {
        this.logger.error(
          `${req.method} ${body.path} ${status} - ${code}: ${body.message}`,
          exception instanceof Error ? exception.stack : String(exception),
          logContext,
        );
      } else {
        this.logger.warn(
          `${req.method} ${body.path} ${status} - ${code}: ${body.message}`,
          logContext,
        );
      }
    }

    res.status(status).json(body);
  }
}

