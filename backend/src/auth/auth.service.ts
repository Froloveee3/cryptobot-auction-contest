import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../users/schemas/user.schema';
import { isValidUsername } from '../common/utils/username.util';
import { isValidPassword } from '../common/utils/password.util';

export type JwtUserPayload = {
  sub: string;
  provider: 'web' | 'telegram';
  roles: Array<'user' | 'admin'>;
};

export type AuthTokenResponse = {
  accessToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwt: JwtService,
  ) {}

  async registerWeb(username: string, password: string): Promise<AuthTokenResponse> {
    const normalized = String(username || '').trim();
    if (!normalized) {
      throw new BadRequestException({ code: 'USERNAME_REQUIRED', message: 'Username is required' });
    }
    if (!isValidUsername(normalized)) {
      throw new BadRequestException({
        code: 'USERNAME_INVALID_FORMAT',
        message: 'Username must start with a letter and contain only letters and digits',
      });
    }
    if (!isValidPassword(password)) {
      throw new BadRequestException({
        code: 'PASSWORD_INVALID_FORMAT',
        message: 'Password must be at least 8 characters and include letters and numbers',
      });
    }

    const existing = await this.userModel.findOne({ username: normalized }).lean().exec();
    if (existing) {
      throw new ConflictException({ code: 'USERNAME_EXISTS', message: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new this.userModel({
      username: normalized,
      passwordHash,
      authProvider: 'web',
      roles: ['user'],
      balance: 0,
    });
    await user.save();

    return this.issueToken(user._id.toString(), 'web', user.roles ?? ['user']);
  }

  async loginWeb(username: string, password: string): Promise<AuthTokenResponse> {
    const normalized = String(username || '').trim();
    if (!normalized || !password) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }
    if (!isValidUsername(normalized)) {
      throw new BadRequestException({
        code: 'USERNAME_INVALID_FORMAT',
        message: 'Username must start with a letter and contain only letters and digits',
      });
    }
    const user = await this.userModel
      .findOne({ username: normalized, authProvider: 'web' })
      .select({ passwordHash: 1, roles: 1 })
      .exec();

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    return this.issueToken(user._id.toString(), 'web', user.roles ?? ['user']);
  }

  issueToken(userId: string, provider: 'web' | 'telegram', roles: Array<'user' | 'admin'>): AuthTokenResponse {
    const payload: JwtUserPayload = { sub: userId, provider, roles };
    return { accessToken: this.jwt.sign(payload) };
  }
}

