import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const username = this.config.get<string>('ADMIN_USERNAME');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!username || !password) {
      this.logger.warn('ADMIN_USERNAME/ADMIN_PASSWORD not set; admin bootstrap skipped');
      return;
    }

    const existing = await this.userModel.findOne({ username, authProvider: 'web' }).exec();
    if (existing) {
      
      if (!existing.roles?.includes('admin')) {
        existing.roles = Array.from(new Set([...(existing.roles ?? []), 'admin'])) as any;
        await existing.save();
        this.logger.warn(`Bootstrapped admin role for existing user "${username}"`);
      }
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new this.userModel({
      username,
      passwordHash,
      authProvider: 'web',
      roles: ['admin'],
      balance: 0,
    });
    await user.save();
    this.logger.warn(`Created admin user "${username}" from env bootstrap`);
  }
}

