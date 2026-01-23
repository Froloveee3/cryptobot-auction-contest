import { Injectable, LoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ConfigService } from '@nestjs/config';

export interface LogContext {
  requestId?: string;
  userId?: string;
  auctionId?: string;
  roundId?: string;
  bidId?: string;
  [key: string]: any;
}

@Injectable({ scope: Scope.TRANSIENT })
export class AppLoggerService implements LoggerService {
  private winstonLogger: winston.Logger;
  private context?: string;

  constructor(private configService?: ConfigService) {
    const nodeEnv = this.configService?.get<string>('NODE_ENV', 'development');
    const isProduction = nodeEnv === 'production';

    
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
    );

    
    const consoleFormat = isProduction
      ? logFormat
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          winston.format.printf((info) => {
            const { timestamp, level, message, context, requestId, ...meta } = info;
            const contextStr = context ? `[${context}]` : '';
            const requestIdStr = requestId ? `[${requestId}]` : '';
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level} ${contextStr}${requestIdStr} ${message}${metaStr}`;
          }),
        );

    // File transports
    const fileTransports: winston.transport[] = [
      // Error logs
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        format: logFormat,
        maxSize: '20m',
        maxFiles: '14d',
        zippedArchive: true,
      }),
      // Combined logs
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        format: logFormat,
        maxSize: '20m',
        maxFiles: '14d',
        zippedArchive: true,
      }),
    ];

    this.winstonLogger = winston.createLogger({
      level: this.configService?.get<string>('LOG_LEVEL', isProduction ? 'info' : 'debug'),
      format: logFormat,
      defaultMeta: {
        service: 'auction-backend',
      },
      transports: [
        ...fileTransports,
        new winston.transports.Console({
          format: consoleFormat,
        }),
      ],
      // Handle exceptions and rejections
      exceptionHandlers: [
        new DailyRotateFile({
          filename: 'logs/exceptions-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          format: logFormat,
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
      rejectionHandlers: [
        new DailyRotateFile({
          filename: 'logs/rejections-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          format: logFormat,
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });
  }

  setContext(context: string): void {
    this.context = context;
  }

  private logWithContext(level: string, message: string, context?: LogContext, trace?: string): void {
    const logData: winston.LogEntry = {
      level,
      message,
      context: this.context,
      ...context,
    };

    if (trace) {
      logData.trace = trace;
    }

    this.winstonLogger.log(logData);
  }

  log(message: string, context?: LogContext): void {
    this.logWithContext('info', message, context);
  }

  error(message: string, trace?: string, context?: LogContext): void {
    this.logWithContext('error', message, context, trace);
  }

  warn(message: string, context?: LogContext): void {
    this.logWithContext('warn', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.logWithContext('debug', message, context);
  }

  verbose(message: string, context?: LogContext): void {
    this.logWithContext('verbose', message, context);
  }
}
