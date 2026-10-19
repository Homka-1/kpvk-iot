import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import { CabinetProfileController, StudentProfileController } from './profile.controller.js';
import { StudentProfileService } from './profile.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  controllers: [StudentsController, StudentProfileController, CabinetProfileController],
  providers: [StudentsService, StudentProfileService, IdempotencyService],
  exports: [StudentsService],
})
export class StudentsModule {}
