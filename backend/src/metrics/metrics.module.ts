import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsEventsHandler } from '../common/events/handlers/metrics-events.handler';

@Module({
  providers: [MetricsService, MetricsEventsHandler],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}

