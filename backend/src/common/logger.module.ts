import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLoggerService } from './services/logger.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class LoggerModule {}
