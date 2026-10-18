import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ConsultationsService } from './consultations.service.js';
import {
  CabinetFeedbackController,
  ConsultationsController,
  FeedbackController,
  StudentSupportController,
} from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [
    FeedbackController,
    StudentSupportController,
    ConsultationsController,
    CabinetFeedbackController,
  ],
  providers: [FeedbackService, ConsultationsService, IdempotencyService],
})
export class FeedbackModule {}
