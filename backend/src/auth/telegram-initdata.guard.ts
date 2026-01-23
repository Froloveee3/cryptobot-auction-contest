import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateTelegramInitData } from './telegram-initdata.util';

@Injectable()
export class TelegramInitDataGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<any>();
    const initDataRaw: string | undefined =
      req.header('x-telegram-init-data') || req.query?.initData || req.body?.initData;

    if (!initDataRaw) return false;

    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) return false;

    
    const maxAgeSec = Number(this.config.get<string>('TELEGRAM_INITDATA_MAX_AGE_SEC', '86400'));
    const tgUser = validateTelegramInitData(initDataRaw, botToken, maxAgeSec);
    if (!tgUser) return false;

    
    
    req.user = {
      sub: `tg:${tgUser.id}`,
      provider: 'telegram',
      roles: ['user'],
      telegram: tgUser,
    };

    return true;
  }
}

