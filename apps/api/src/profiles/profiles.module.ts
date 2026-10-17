import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import {
  MotivationProfilesController,
  MotivationStrategiesController,
  StudentMotivationController,
} from './motivation-profiles.controller.js';
import { MotivationProfilesService } from './motivation-profiles.service.js';

@Module({
  controllers: [
    StudentMotivationController,
    MotivationProfilesController,
    MotivationStrategiesController,
  ],
  providers: [MotivationProfilesService, IdempotencyService],
})
export class ProfilesModule {}
