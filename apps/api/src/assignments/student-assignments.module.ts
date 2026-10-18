import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import {
  CabinetAssignmentsController,
  StudentAssignmentsController,
} from './student-assignments.controller.js';
import { StudentAssignmentsService } from './student-assignments.service.js';

@Module({
  controllers: [StudentAssignmentsController, CabinetAssignmentsController],
  providers: [StudentAssignmentsService, IdempotencyService],
})
export class StudentAssignmentsModule {}
