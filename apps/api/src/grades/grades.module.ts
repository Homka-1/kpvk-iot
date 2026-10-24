import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import { GradesController, StudentGradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';

@Module({
  controllers: [GradesController, StudentGradesController],
  providers: [GradesService, IdempotencyService],
})
export class GradesModule {}
