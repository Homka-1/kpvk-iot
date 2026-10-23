import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import {
  LessonsController,
  ObservationCriteriaController,
  StudentLessonJournalController,
} from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';

@Module({
  controllers: [LessonsController, StudentLessonJournalController, ObservationCriteriaController],
  providers: [LessonsService, IdempotencyService],
})
export class LessonsModule {}
