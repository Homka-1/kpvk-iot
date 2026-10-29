import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import {
  CabinetTrajectoriesController,
  TrajectoriesController,
  TrajectoryOptionsController,
} from './trajectories.controller.js';
import { TrajectoriesService } from './trajectories.service.js';
import { TrajectoryTemplatesCatalogSync } from './trajectory-templates-catalog.js';

@Module({
  imports: [ProfilesModule],
  controllers: [TrajectoryOptionsController, TrajectoriesController, CabinetTrajectoriesController],
  providers: [TrajectoriesService, TrajectoryTemplatesCatalogSync, IdempotencyService],
  exports: [TrajectoriesService],
})
export class TrajectoriesModule {}
