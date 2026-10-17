import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import {
  DiagnosticDirectionsController,
  QuestionnairesController,
} from './questionnaires.controller.js';
import { QuestionnairesService } from './questionnaires.service.js';
import {
  CabinetDiagnosticsController,
  DiagnosticAssignmentsController,
  DiagnosticSessionsController,
  StudentDiagnosticsController,
} from './sessions.controller.js';
import { DiagnosticSessionsService } from './sessions.service.js';

@Module({
  controllers: [
    DiagnosticDirectionsController,
    QuestionnairesController,
    DiagnosticAssignmentsController,
    DiagnosticSessionsController,
    StudentDiagnosticsController,
    CabinetDiagnosticsController,
  ],
  providers: [QuestionnairesService, DiagnosticSessionsService, IdempotencyService],
})
export class DiagnosticsModule {}
