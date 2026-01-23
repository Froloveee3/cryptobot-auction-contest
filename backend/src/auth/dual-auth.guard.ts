import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TelegramInitDataGuard } from './telegram-initdata.guard';
import { TelegramUsersService } from './telegram-users.service';

@Injectable()
export class DualAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly telegramGuard: TelegramInitDataGuard,
    private readonly telegramUsers: TelegramUsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();

    const auth = req.header('authorization');
    if (auth && auth.startsWith('Bearer ')) {
      
      const token = auth.slice('Bearer '.length);
      const secret = this.config.get<string>('JWT_SECRET', 'dev_insecure_secret_change_me');
      try {
        const payload = this.jwt.verify(token, { secret }) as any;
        req.user = payload;
        return true;
      } catch {
        
        
        const url = String(req.originalUrl || req.url || '');
        if (url.includes('/auth/refresh')) {
          try {
            const payload = this.jwt.verify(token, { secret, ignoreExpiration: true }) as any;
            const expSec = typeof payload?.exp === 'number' ? payload.exp : null;
            const nowMs = Date.now();
            const expMs = expSec ? expSec * 1000 : null;
            const graceSec = Number(this.config.get<string>('JWT_REFRESH_GRACE_SEC', '86400')); 
            const graceMs = Number.isFinite(graceSec) ? graceSec * 1000 : 86400 * 1000;
            if (expMs && nowMs - expMs <= graceMs) {
              req.user = payload;
              return true;
            }
          } catch {
            
          }
        }
        
      }
    }

    
    if (req.header('x-telegram-init-data') || req.query?.initData || req.body?.initData) {
      const ok = this.telegramGuard.canActivate(context);
      if (!ok) return false;
      
      const tg = req.user?.telegram;
      if (tg?.id) {
        const ensured = await this.telegramUsers.ensureTelegramUser(tg);
        req.user = {
          sub: ensured.userId,
          provider: 'telegram',
          roles: ensured.roles,
          telegram: tg,
        };
      }
      return true;
    }

    
    const allowInsecure = this.config.get<string>('ALLOW_INSECURE_QUERY_USERID', 'false') === 'true';
    if (allowInsecure) {
      const userId = req.query?.userId;
      if (!userId) return false;
      
      
      req.user = { sub: String(userId), provider: 'legacy', roles: ['user'] };
      return true;
    }

    return false;
  }
}

