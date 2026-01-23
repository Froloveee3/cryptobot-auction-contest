import { Body, Controller, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService, AuthTokenResponse } from './auth.service';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { TelegramInitDataGuard } from './telegram-initdata.guard';
import { TelegramUsersService } from './telegram-users.service';
import { DualAuthGuard } from './dual-auth.guard';

type RegisterDto = {
  username: string;
  password: string;
};

type LoginDto = {
  username: string;
  password: string;
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly telegramUsers: TelegramUsersService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register website user (strict auth)' })
  @ApiCreatedResponse({ description: 'Registered' })
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'auth_register', windowSec: 60, max: 10 })
  async register(@Body() body: RegisterDto): Promise<AuthTokenResponse> {
    return this.auth.registerWeb(body.username, body.password);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login website user (strict auth)' })
  @ApiOkResponse({ description: 'Logged in' })
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'auth_login', windowSec: 60, max: 20 })
  async login(@Body() body: LoginDto): Promise<AuthTokenResponse> {
    return this.auth.loginWeb(body.username, body.password);
  }

  @Post('telegram')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login via Telegram WebView initData (issue our JWT)' })
  @ApiOkResponse({ description: 'Logged in via Telegram initData' })
  @UseGuards(TelegramInitDataGuard)
  async loginTelegram(@Req() req: any): Promise<AuthTokenResponse> {
    const tg = req.user?.telegram;
    const ensured = await this.telegramUsers.ensureTelegramUser(tg);
    return this.auth.issueToken(ensured.userId, 'telegram', ensured.roles);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh JWT (sliding session) while authenticated' })
  @ApiOkResponse({ description: 'Token refreshed' })
  @UseGuards(RateLimitGuard, DualAuthGuard)
  @RateLimit({ key: 'auth_refresh', windowSec: 60, max: 120 })
  async refresh(@Req() req: any): Promise<AuthTokenResponse> {
    const userId = String(req.user?.sub || '');
    const provider = req.user?.provider as 'web' | 'telegram' | 'legacy' | undefined;
    const roles = (Array.isArray(req.user?.roles) ? req.user.roles : ['user']) as Array<'user' | 'admin'>;
    if (!userId) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }
    if (provider !== 'web' && provider !== 'telegram') {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }
    return this.auth.issueToken(userId, provider, roles);
  }
}

