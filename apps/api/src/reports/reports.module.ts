import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { StudentsModule } from '../students/students.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [AnalyticsModule, DiagnosticsModule, MonitoringModule, ProfilesModule, StudentsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
