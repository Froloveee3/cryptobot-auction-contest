import { CanActivate, ExecutionContext, Injectable, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { RATE_LIMIT_KEY, RateLimitConfig } from './rate-limit.decorator';
import { ConfigService } from '@nestjs/config';
import { ExtendedRequest } from '../types/express.types';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<RateLimitConfig>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!config) return true;

    const req = context.switchToHttp().getRequest<ExtendedRequest>();
    if (!req) {
      return true; 
    }
    const ipValue = req.ip || req.headers?.['x-forwarded-for'] || 'unknown';
    const ipParts = (ipValue ? String(ipValue) : 'unknown').split(',');
    const ip = ipParts[0]?.trim() || 'unknown';
    const subject = req.user?.sub ? `u:${req.user.sub}` : `ip:${ip}`;

    const key = `rl:${config.key}:${subject}`;
    const windowSec = Math.max(1, config.windowSec);
    const disabled = this.config.get<string>('RATE_LIMIT_DISABLED', 'false') === 'true';
    if (disabled) return true;

    const multiplier = Number(this.config.get<string>('RATE_LIMIT_MULTIPLIER', '1')) || 1;
    const max = Math.max(1, Math.floor(config.max * multiplier));

    // Atomic-ish rate limit: INCR then set EXPIRE on first hit.
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSec);
    }

    if (count > max) {
      throw new HttpException('Too many requests', 429);
    }

    return true;
  }
}

