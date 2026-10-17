import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, IdempotencyService],
})
export class StudentsModule {}
