import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { DualAuthGuard } from '../auth/dual-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

@ApiTags('admin-queues')
@Controller('admin/queues')
export class QueuesAdminController {
  constructor(
    @InjectQueue('bid-intake') private readonly bidIntake: Queue,
    private readonly config: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Get('bid-intake/health')
  @ApiOperation({ summary: 'Bid intake queue health (admin)' })
  @ApiOkResponse({ description: 'Queue health' })
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles('admin')
  async bidIntakeHealth() {
    const counts = await this.bidIntake.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'paused',
      'failed',
      'completed',
    );
    const jobs = await this.bidIntake.getJobs(['waiting'], 0, 0);
    const oldest = jobs && jobs.length > 0 ? jobs[0] : null;
    const oldestWaitingMs = oldest && typeof oldest.timestamp === 'number' ? Math.max(0, Date.now() - oldest.timestamp) : 0;

    const maxWaiting = Number(this.config.get<string>('BID_INTAKE_MAX_WAITING', '50000'));
    const maxOldestWaitingMs = Number(this.config.get<string>('BID_INTAKE_MAX_OLDEST_WAITING_MS', '2000'));
    const lagShedderEnabled = this.config.get<string>('BID_INTAKE_LAG_SHEDDER_ENABLED', 'true') === 'true';
    const smartEnabled = this.config.get<string>('BID_INTAKE_SMART_ADMISSION_ENABLED', 'true') === 'true';
    const baseAuctionRps = Number(this.config.get<string>('BID_INTAKE_AUCTION_RPS_BASE', '5000'));
    const baseGlobalRps = Number(this.config.get<string>('BID_INTAKE_GLOBAL_RPS_BASE', '20000'));

    const admissionRaw = await this.redis.get('queue:bid-intake:admission');
    let admission: any = null;
    try {
      admission = admissionRaw ? JSON.parse(admissionRaw) : null;
    } catch {
      admission = null;
    }
    const mult = admission && typeof admission.multiplier === 'number' ? admission.multiplier : null;
    const effectiveAuctionRps = mult !== null && Number.isFinite(baseAuctionRps) ? Math.max(1, Math.floor(baseAuctionRps * mult)) : null;
    const effectiveGlobalRps = mult !== null && Number.isFinite(baseGlobalRps) ? Math.max(1, Math.floor(baseGlobalRps * mult)) : null;

    return {
      queue: this.bidIntake.name,
      counts,
      oldestWaitingMs,
      shedder: {
        enabled: lagShedderEnabled,
        maxWaiting,
        maxOldestWaitingMs,
      },
      admission: {
        enabled: smartEnabled,
        baseAuctionRps,
        baseGlobalRps,
        multiplier: mult,
        effectiveAuctionRps,
        effectiveGlobalRps,
        raw: admission,
      },
      fairness: {
        enabled: this.config.get<string>('BID_INTAKE_USER_FAIRNESS_ENABLED', 'true') === 'true',
        baseUserRps: Number(this.config.get<string>('BID_INTAKE_USER_RPS_BASE', '10')),
        burst: Number(this.config.get<string>('BID_INTAKE_USER_BURST', '30')),
      },
      priority: {
        queue: 'bid-intake',
        policy: {
          raise: 1,
          new: 5,
        },
      },
      now: new Date().toISOString(),
    };
  }
}

