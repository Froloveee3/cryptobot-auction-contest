import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUserPayload } from './auth.service';
import { ExtendedRequest } from '../common/types/express.types';

export const CurrentUser = createParamDecorator((_data: never, ctx: ExecutionContext): JwtUserPayload | undefined => {
  const req = ctx.switchToHttp().getRequest<ExtendedRequest>();
  return req.user as JwtUserPayload | undefined;
});

