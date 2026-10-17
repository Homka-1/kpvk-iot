import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import {
  DiagnosticDirectionsController,
  QuestionnairesController,
} from './questionnaires.controller.js';
import { QuestionnairesService } from './questionnaires.service.js';

@Module({
  controllers: [DiagnosticDirectionsController, QuestionnairesController],
  providers: [QuestionnairesService, IdempotencyService],
})
export class DiagnosticsModule {}
