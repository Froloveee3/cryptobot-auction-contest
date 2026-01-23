import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { runWithRequestId } from '../utils/request-context';

export const REQUEST_ID_HEADER = 'x-request-id';


export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.trim() ? incoming.trim() : randomUUID();

  (req as any).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithRequestId(requestId, () => next());
}

