import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { ResearchController } from './research.controller.js';
import { ResearchService } from './research.service.js';

@Module({
  imports: [MonitoringModule, ProfilesModule],
  controllers: [AnalyticsController, ResearchController],
  providers: [AnalyticsService, ResearchService, IdempotencyService],
})
export class AnalyticsModule {}
