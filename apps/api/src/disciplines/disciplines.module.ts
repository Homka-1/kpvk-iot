import { Module } from '@nestjs/common';
import { DisciplinesController, TeacherAssignmentsController } from './disciplines.controller.js';
import { DisciplinesService } from './disciplines.service.js';

@Module({
  controllers: [DisciplinesController, TeacherAssignmentsController],
  providers: [DisciplinesService],
})
export class DisciplinesModule {}
