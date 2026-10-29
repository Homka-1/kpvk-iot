import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import {
  CabinetControlResultsController,
  ControlWorksController,
  StudentControlResultsController,
} from './control-works.controller.js';
import { ControlWorksService } from './control-works.service.js';

@Module({
  controllers: [
    ControlWorksController,
    StudentControlResultsController,
    CabinetControlResultsController,
  ],
  providers: [ControlWorksService, IdempotencyService],
})
export class ControlWorksModule {}
