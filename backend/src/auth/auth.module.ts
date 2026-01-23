import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User, UserSchema } from '../users/schemas/user.schema';
import { TelegramInitDataGuard } from './telegram-initdata.guard';
import { TelegramUsersService } from './telegram-users.service';
import { DualAuthGuard } from './dual-auth.guard';
import { RolesGuard } from './roles.guard';
import { AdminBootstrapService } from './admin-bootstrap.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV', 'development');
        const secret = config.get<string>('JWT_SECRET', 'dev_insecure_secret_change_me');
        if (nodeEnv === 'production' && (!secret || secret === 'dev_insecure_secret_change_me')) {
          throw new Error('JWT_SECRET must be set in production');
        }
        return {
          secret,
        
        signOptions: { expiresIn: Number(config.get<string>('JWT_EXPIRES_IN_SEC', '3600')) },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TelegramInitDataGuard, TelegramUsersService, DualAuthGuard, RolesGuard, AdminBootstrapService],
  exports: [AuthService, JwtModule, TelegramInitDataGuard, TelegramUsersService, DualAuthGuard, RolesGuard],
})
export class AuthModule {}

