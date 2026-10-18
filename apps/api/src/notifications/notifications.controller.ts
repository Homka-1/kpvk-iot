import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { NotificationDto, NotificationsDto } from '@iot/shared';
import { type AuthUser, User } from '../auth/decorators.js';
import { NotificationResponseDto, NotificationsResponseDto } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Уведомления')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Мои уведомления и число непрочитанных (FR-065)',
    description:
      'Последние уведомления текущего пользователя для бейджа и списка в шапке. Чужие уведомления не выдаются.',
  })
  @ApiOkResponse({ type: NotificationsResponseDto })
  list(@User() user: AuthUser): Promise<NotificationsDto> {
    return this.notifications.list(user);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Отметить уведомление прочитанным' })
  @ApiOkResponse({ type: NotificationResponseDto })
  markRead(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<NotificationDto> {
    return this.notifications.markRead(user, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Отметить все уведомления прочитанными' })
  @ApiOkResponse({ type: NotificationsResponseDto })
  markAllRead(@User() user: AuthUser): Promise<NotificationsDto> {
    return this.notifications.markAllRead(user);
  }
}
