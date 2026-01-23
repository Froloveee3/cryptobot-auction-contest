

import { Request } from 'express';


export interface ExtendedRequest extends Request {
  id?: string;
  user?: {
    sub: string;
    username?: string;
    roles?: string[];
  };
}


export function isExtendedRequest(req: Request): req is ExtendedRequest {
  return typeof req === 'object' && req !== null;
}
