import { ApiProperty } from '@nestjs/swagger';

export class NotificationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'Тип события, например feedback.created, consultation.scheduled' })
  type: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) body: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Путь в приложении' })
  link: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) readAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class NotificationsResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] }) items: NotificationResponseDto[];
  @ApiProperty({ description: 'Число непрочитанных уведомлений' }) unread: number;
}
