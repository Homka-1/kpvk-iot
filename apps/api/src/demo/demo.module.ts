import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { TrajectoriesModule } from '../trajectories/trajectories.module.js';
import { DemoActivityGenerator } from './demo-activity.js';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';

@Module({
  imports: [ProfilesModule, TrajectoriesModule],
  controllers: [DemoController],
  providers: [DemoService, DemoActivityGenerator],
})
export class DemoModule {}
