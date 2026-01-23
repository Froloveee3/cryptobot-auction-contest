import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const uri = configService.getOrThrow<string>('MONGODB_URI');
        return {
          uri,
          retryWrites: true,
          w: 'majority',
          
          maxPoolSize: 100, 
          minPoolSize: 10, 
          
          socketTimeoutMS: 45000, 
          serverSelectionTimeoutMS: 5000, 
          
          maxIdleTimeMS: 30000, 
          
          readPreference: 'primary',
          
          writeConcern: { w: 'majority', j: true }, 
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
