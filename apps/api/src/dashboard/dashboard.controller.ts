import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type DashboardDto, Permission } from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { DashboardQueryDto, DashboardResponseDto } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Главная панель')
@ApiBearerAuth()
@Controller('dashboard')
@RequirePermissions(Permission.STUDENTS_READ, Permission.MONITORING_READ)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary:
      'Главная панель преподавателя: показатели, диаграммы, задания, активность (FR-001–FR-005)',
    description:
      'Только студенты области пользователя (FR-002) с учётом группы, дисциплины и периода наблюдения (FR-004). Показатели ИОТ считаются по правилам мониторинга, ожидающие проверки — по очереди проверки, поэтому совпадают с отфильтрованными списками (FR-003). Показатель без базы (нет студентов или маршрутов) — null, а не 0 (FR-005). Ответ не кэшируется (FR-001).',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  overview(@Query() query: DashboardQueryDto, @User() user: AuthUser): Promise<DashboardDto> {
    return this.dashboard.overview(user, query);
  }
}
