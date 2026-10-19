import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [MonitoringModule, ProfilesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
