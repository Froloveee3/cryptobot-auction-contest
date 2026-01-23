import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { IBalanceTransaction, TransactionType } from '../common/types/entities.types';
import { PaginatedResponseDto } from '../common/types/dto.types';
import { IBalanceService } from '../common/types/service.types';
import { BalanceTransaction } from './schemas/balance-transaction.schema';
import { User } from '../users/schemas/user.schema';
import { toPlainObject } from '../common/utils/mongoose.helper';
import { MongoSession, isTransientTransactionError, isReplicaSetError } from '../common/types/mongodb.types';
import { InsufficientBalanceError, WriteConflictError } from '../common/types/domain-errors.types';

@Injectable()
export class BalanceService implements IBalanceService {
  constructor(
    @InjectModel(BalanceTransaction.name)
    private transactionModel: Model<BalanceTransaction>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  private async hasTransaction(
    userId: string,
    type: TransactionType,
    referenceId: string | null,
    session?: ClientSession,
  ): Promise<boolean> {
    if (!referenceId) return false;
    const q = this.transactionModel
      .findOne({ userId, type, referenceId })
      .select({ _id: 1 })
      .lean();
    const existing = session ? await q.session(session).exec() : await q.exec();
    return !!existing;
  }

  async lock(
    userId: string,
    amount: number,
    referenceId: string,
    session?: ClientSession,
  ): Promise<void> {
    
    if (session) {
      const alreadyLocked = await this.hasTransaction(userId, 'bid_lock', referenceId, session);
      if (alreadyLocked) return;

      const user = await this.userModel.findById(userId).session(session).exec();
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (user.balance < amount) {
        throw new Error('Insufficient balance');
      }

      const balanceBefore = user.balance;
      user.balance -= amount;
      await user.save({ session });

      await this.createTransaction(
        userId,
        'bid_lock',
        amount,
        balanceBefore,
        user.balance,
        referenceId,
        `Locked ${amount} for bid`,
        session,
      );
      return;
    }

    // Try to use transaction, fallback to non-transactional if replica set is not available
    try {
      const session = await this.userModel.db.startSession();
      session.startTransaction();

      try {
        const alreadyLocked = await this.hasTransaction(userId, 'bid_lock', referenceId, session);
        if (alreadyLocked) {
          await session.commitTransaction();
          return;
        }

        const user = await this.userModel.findById(userId).session(session).exec();
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }

        if (user.balance < amount) {
          throw new InsufficientBalanceError(userId, amount, user.balance);
        }

        const balanceBefore = user.balance;
        user.balance -= amount;
        await user.save({ session });

        await this.createTransaction(
          userId,
          'bid_lock',
          amount,
          balanceBefore,
          user.balance,
          referenceId,
          `Locked ${amount} for bid`,
          session,
        );

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (transactionError: unknown) {
      // Fallback for standalone MongoDB (no replica set)
      if (isReplicaSetError(transactionError)) {
        const alreadyLocked = await this.hasTransaction(userId, 'bid_lock', referenceId);
        if (alreadyLocked) return;

        const user = await this.userModel.findById(userId).exec();
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }

        if (user.balance < amount) {
          throw new InsufficientBalanceError(userId, amount, user.balance);
        }

        const balanceBefore = user.balance;
        user.balance -= amount;
        await user.save();

        await this.createTransaction(
          userId,
          'bid_lock',
          amount,
          balanceBefore,
          user.balance,
          referenceId,
          `Locked ${amount} for bid`,
        );
      } else {
        throw transactionError;
      }
    }
  }

  async charge(
    userId: string,
    amount: number,
    referenceId: string,
    session?: ClientSession,
  ): Promise<void> {
    // Idempotency: do not record (or duplicate) charge twice.
    const alreadyCharged = await this.hasTransaction(userId, 'bid_charge', referenceId, session);
    if (alreadyCharged) return;

    // Charge is already done in lock (money moved from available to reserved earlier),
    // this is for ledger/audit only.
    const q = this.userModel.findById(userId).lean();
    const user = session ? await q.session(session).exec() : await q.exec();
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    await this.createTransaction(
      userId,
      'bid_charge',
      amount,
      user.balance,
      user.balance,
      referenceId,
      `Charged ${amount} for winning bid`,
      session,
    );
  }

  async refund(
    userId: string,
    amount: number,
    referenceId: string,
    session?: ClientSession,
  ): Promise<void> {
    // If caller provides a session, we MUST participate in its transaction (no nested tx).
    if (session) {
      const alreadyRefunded = await this.hasTransaction(userId, 'bid_refund', referenceId, session);
      if (alreadyRefunded) return;

      const user = await this.userModel.findById(userId).session(session).exec();
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const balanceBefore = user.balance;
      user.balance += amount;
      await user.save({ session });

      await this.createTransaction(
        userId,
        'bid_refund',
        amount,
        balanceBefore,
        user.balance,
        referenceId,
        `Refunded ${amount} from bid`,
        session,
      );
      return;
    }

    // Try to use transaction, fallback to non-transactional if replica set is not available
    try {
      const session = await this.userModel.db.startSession();
      session.startTransaction();

      try {
        const alreadyRefunded = await this.hasTransaction(userId, 'bid_refund', referenceId, session);
        if (alreadyRefunded) {
          await session.commitTransaction();
          return;
        }

        const user = await this.userModel.findById(userId).session(session).exec();
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }

        const balanceBefore = user.balance;
        user.balance += amount;
        await user.save({ session });

        await this.createTransaction(
          userId,
          'bid_refund',
          amount,
          balanceBefore,
          user.balance,
          referenceId,
          `Refunded ${amount} from bid`,
          session,
        );

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (transactionError: unknown) {
      // Fallback for standalone MongoDB (no replica set)
      if (isReplicaSetError(transactionError)) {
        const alreadyRefunded = await this.hasTransaction(userId, 'bid_refund', referenceId);
        if (alreadyRefunded) return;

        const user = await this.userModel.findById(userId).exec();
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }

        const balanceBefore = user.balance;
        user.balance += amount;
        await user.save();

        await this.createTransaction(
          userId,
          'bid_refund',
          amount,
          balanceBefore,
          user.balance,
          referenceId,
          `Refunded ${amount} from bid`,
        );
      } else {
        throw transactionError;
      }
    }
  }

  private async runWithTransactionRetry<T>(
    fn: (session: MongoSession) => Promise<T>,
    { maxAttempts = 5 } = {},
  ): Promise<T> {
    let lastErr: Error | WriteConflictError = new Error('Transaction retry exhausted');
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const session = await this.userModel.db.startSession();
      session.startTransaction();
      try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        await session.abortTransaction().catch(() => undefined);
        // Retry transient transaction errors / write conflicts
        if (!isTransientTransactionError(e)) {
          throw e;
        }
        if (attempt === maxAttempts) {
          // Let the client retry (409), instead of returning 500 under contention.
          throw new WriteConflictError();
        }
        // Backoff to reduce contention hot-loops under load (quadratic).
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 25 * attempt * attempt));
      } finally {
        session.endSession();
      }
    }
    throw lastErr;
  }

  async deposit(userId: string, amount: number): Promise<void> {
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }

    // Support negative deposits as withdrawals (used by UI "Subtract")
    if (amount < 0) {
      const withdrawalAmount = Math.abs(amount);

      // Try to use transaction, fallback to non-transactional if replica set is not available
      try {
        const session = await this.userModel.db.startSession();
        session.startTransaction();

        try {
          const user = await this.userModel.findById(userId).session(session).exec();
          if (!user) {
            throw new Error(`User ${userId} not found`);
          }

          if (user.balance < withdrawalAmount) {
            throw new Error('Insufficient balance');
          }

          const balanceBefore = user.balance;
          user.balance -= withdrawalAmount;
          await user.save({ session });

          await this.createTransaction(
            userId,
            'withdrawal',
            withdrawalAmount,
            balanceBefore,
            user.balance,
            null,
            `Withdrew ${withdrawalAmount}`,
            session,
          );

          await session.commitTransaction();
          return;
        } catch (error) {
          await session.abortTransaction();
          throw error;
        } finally {
          session.endSession();
        }
      } catch (transactionError: unknown) {
        // Fallback for standalone MongoDB (no replica set)
        if (isReplicaSetError(transactionError)) {
          const user = await this.userModel.findById(userId).exec();
          if (!user) {
            throw new Error(`User ${userId} not found`);
          }

          if (user.balance < withdrawalAmount) {
            throw new Error('Insufficient balance');
          }

          const balanceBefore = user.balance;
          user.balance -= withdrawalAmount;
          await user.save();

          await this.createTransaction(
            userId,
            'withdrawal',
            withdrawalAmount,
            balanceBefore,
            user.balance,
            null,
            `Withdrew ${withdrawalAmount}`,
          );
          return;
        }
        throw transactionError;
      }
    }

    // Positive deposit: use retry for write conflicts (catalog changes, concurrent transactions)
    await this.runWithTransactionRetry(async (session) => {
      const user = await this.userModel.findById(userId).session(session).exec();
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const balanceBefore = user.balance;
      user.balance += amount;
      await user.save({ session });

      await this.createTransaction(
        userId,
        'deposit',
        amount,
        balanceBefore,
        user.balance,
        null,
        `Deposited ${amount}`,
        session,
      );
    }).catch(async (transactionError: unknown) => {
      // Fallback for standalone MongoDB (no replica set)
      if (isReplicaSetError(transactionError)) {
        const user = await this.userModel.findById(userId).exec();
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }
        const balanceBefore = user.balance;
        user.balance += amount;
        await user.save();
        await this.createTransaction(
          userId,
          'deposit',
          amount,
          balanceBefore,
          user.balance,
          null,
          `Deposited ${amount}`,
        );
        return;
      }
      throw transactionError;
    });
  }

  async createTransaction(
    userId: string,
    type: TransactionType,
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    referenceId: string | null,
    description: string,
    session?: ClientSession,
  ): Promise<IBalanceTransaction> {
    const transactionData = {
      userId,
      type,
      amount,
      balanceBefore,
      balanceAfter,
      referenceId,
      description,
    };

    const transaction = new this.transactionModel(transactionData);
    if (session) {
      await transaction.save({ session });
    } else {
      await transaction.save();
    }
    return toPlainObject(transaction) as IBalanceTransaction;
  }

  async checkBalance(userId: string, amount: number): Promise<boolean> {
    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) {
      return false;
    }
    return user.balance >= amount;
  }

  async getTransactions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponseDto<IBalanceTransaction>> {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.transactionModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.transactionModel.countDocuments({ userId }),
    ]);

    return {
      data: data.map((item) => ({
        ...item,
        id: item._id.toString(),
        _id: item._id.toString(),
      })) as IBalanceTransaction[],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
