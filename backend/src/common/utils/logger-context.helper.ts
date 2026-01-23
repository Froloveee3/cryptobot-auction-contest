import { ExecutionContext, ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import { getCurrentRequestId } from './request-context';


export function getRequestIdFromContext(
  context: ExecutionContext | ArgumentsHost | Request | { requestId?: string },
): string | undefined {
  
  if (context && typeof context === 'object' && 'requestId' in context) {
    return (context as { requestId?: string }).requestId;
  }

  
  if ('switchToHttp' in context && typeof (context as ExecutionContext | ArgumentsHost).switchToHttp === 'function') {
    const ctx = context as ExecutionContext | ArgumentsHost;
    const req = ctx.switchToHttp().getRequest<Request>();
    return (req as any).requestId || (req.headers['x-request-id'] as string | undefined);
  }

  
  if ('headers' in context && typeof (context as Request).headers === 'object') {
    const req = context as Request;
    return (req as any).requestId || (req.headers['x-request-id'] as string | undefined);
  }

  return undefined;
}


export function getRequestId(): string | undefined {
  return getCurrentRequestId();
}
