import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import { LibraryModule } from '../library/library.module.js';
import {
  CabinetAssignmentsController,
  StudentAssignmentsController,
} from './student-assignments.controller.js';
import { StudentAssignmentsService } from './student-assignments.service.js';
import {
  AssignmentReviewController,
  CabinetSubmissionsController,
} from './submissions.controller.js';
import { SubmissionsService } from './submissions.service.js';

@Module({
  imports: [LibraryModule],
  // Проверка объявлена раньше: маршрут `student-assignments/review` не должен попасть в `:id`.
  controllers: [
    AssignmentReviewController,
    StudentAssignmentsController,
    CabinetAssignmentsController,
    CabinetSubmissionsController,
  ],
  providers: [StudentAssignmentsService, SubmissionsService, IdempotencyService],
})
export class StudentAssignmentsModule {}
