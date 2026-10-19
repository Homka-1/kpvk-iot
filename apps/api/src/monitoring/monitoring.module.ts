import { Module } from '@nestjs/common';
import { MonitoringAlertsService } from './monitoring-alerts.service.js';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';

@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringAlertsService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
