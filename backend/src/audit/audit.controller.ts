import { Controller, Get, Param, Post, Query, UseGuards, NotFoundException, HttpCode } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BalanceAuditResult, BalanceAuditService } from './balance-audit.service';
import { DomainEventsAuditQueryService } from './domain-events-audit-query.service';
import { AuditEventsQueryDto } from './dto/audit-events-query.dto';
import { OutboxQueryDto } from './dto/outbox-query.dto';
import { OutboxAdminService } from './outbox-admin.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DualAuthGuard } from '../auth/dual-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('admin-audit')
@Controller('admin/audit')
export class AuditController {
  constructor(
    private readonly audit: BalanceAuditService,
    private readonly eventsAudit: DomainEventsAuditQueryService,
    private readonly outboxAdmin: OutboxAdminService,
    @InjectQueue('outbox-dispatch') private readonly outboxDispatchQueue: Queue,
  ) {}

  @Get('users/:id/balance')
  @ApiOperation({ summary: 'Audit user balance ledger (admin)' })
  @ApiOkResponse({ description: 'Audit result' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async auditUserBalance(@Param('id') userId: string): Promise<BalanceAuditResult> {
    return this.audit.auditUser(userId);
  }

  @Get('events')
  @ApiOperation({ summary: 'List domain event audit records (admin)' })
  @ApiOkResponse({ description: 'Audit events list' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async listAuditEvents(@Query() query: AuditEventsQueryDto) {
    return this.eventsAudit.list(query);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get a domain event audit record by id (admin)' })
  @ApiOkResponse({ description: 'Audit event record' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async getAuditEvent(@Param('id') id: string) {
    const item = await this.eventsAudit.getById(id);
    if (!item) throw new NotFoundException('Audit event not found');
    return item;
  }

  @Get('outbox')
  @ApiOperation({ summary: 'List outbox events (admin)' })
  @ApiOkResponse({ description: 'Outbox list' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async listOutbox(@Query() query: OutboxQueryDto) {
    return this.outboxAdmin.list(query);
  }

  @Get('outbox/:eventId')
  @ApiOperation({ summary: 'Get outbox event by eventId (admin)' })
  @ApiOkResponse({ description: 'Outbox event' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async getOutbox(@Param('eventId') eventId: string) {
    const item = await this.outboxAdmin.get(eventId);
    if (!item) throw new NotFoundException('Outbox event not found');
    return item;
  }

  @Post('outbox/:eventId/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retry outbox event (admin)' })
  @ApiOkResponse({ description: 'Retry scheduled' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async retryOutbox(@Param('eventId') eventId: string) {
    const ok = await this.outboxAdmin.retry(eventId);
    if (!ok) throw new NotFoundException('Outbox event not found');
    await this.outboxDispatchQueue.add('dispatch', {}, { jobId: 'dispatch-outbox', removeOnComplete: true, removeOnFail: true });
    return { ok: true };
  }

  @Post('outbox/dispatch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger outbox dispatcher job (admin)' })
  @ApiOkResponse({ description: 'Dispatch triggered' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async triggerOutboxDispatch() {
    await this.outboxDispatchQueue.add('dispatch', {}, { jobId: 'dispatch-outbox', removeOnComplete: true, removeOnFail: true });
    return { ok: true };
  }
}

