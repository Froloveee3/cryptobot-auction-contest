import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BalanceService } from './balance.service';
import { BalanceTransaction, BalanceTransactionSchema } from './schemas/balance-transaction.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BalanceTransaction.name, schema: BalanceTransactionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
