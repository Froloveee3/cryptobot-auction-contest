import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditController } from './audit.controller';
import { BalanceAuditService } from './balance-audit.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { BalanceTransaction, BalanceTransactionSchema } from '../balance/schemas/balance-transaction.schema';
import { DomainEventAudit, DomainEventAuditSchema } from './schemas/domain-event-audit.schema';
import { AuthModule } from '../auth/auth.module';
import { DomainEventsAuditService } from './domain-events-audit.service';
import { DomainEventsAuditQueryService } from './domain-events-audit-query.service';
import { AuditEventsHandler } from '../common/events/handlers/audit-events.handler';
import { OutboxEvent, OutboxEventSchema } from '../common/events/outbox/outbox-event.schema';
import { OutboxAdminService } from './outbox-admin.service';
import { QueuesAdminController } from './queues-admin.controller';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: BalanceTransaction.name, schema: BalanceTransactionSchema },
      { name: DomainEventAudit.name, schema: DomainEventAuditSchema },
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
  ],
  controllers: [AuditController, QueuesAdminController],
  providers: [
    BalanceAuditService,
    DomainEventsAuditService,
    DomainEventsAuditQueryService,
    AuditEventsHandler,
    OutboxAdminService,
  ],
  exports: [DomainEventsAuditService, DomainEventsAuditQueryService, OutboxAdminService],
})
export class AuditModule {}

