import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type MonitoringDetailDto,
  type MonitoringDto,
  Permission,
  type SupportStatusDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import {
  MonitoringDetailResponseDto,
  MonitoringPeriodQueryDto,
  MonitoringQueryDto,
  MonitoringResponseDto,
  SupportStatusInputDto,
  SupportStatusResponseDto,
} from './monitoring.dto.js';
import { MonitoringService } from './monitoring.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Мониторинг')
@ApiBearerAuth()
@Controller('monitoring')
@RequirePermissions(Permission.STUDENTS_READ, Permission.MONITORING_READ)
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get()
  @ApiOperation({
    summary: 'Мониторинг ИОТ: показатели, предупреждения и динамика (FR-056–FR-059, FR-062)',
    description:
      'Действующие и завершённые ИОТ студентов в области пользователя (FR-002) с фильтрами по группе, дисциплине, студенту и периоду (FR-057). Период ограничивает маршруты (по пересечению сроков) и события: оценки, отправленные ответы, обращения, диагностику. Учебная активность и диагностика считаются раздельно; входы в систему не учитываются (FR-062). Пропуски — null, а не 0.',
  })
  @ApiOkResponse({ type: MonitoringResponseDto })
  overview(@Query() query: MonitoringQueryDto, @User() user: AuthUser): Promise<MonitoringDto> {
    return this.monitoring.overview(user, query);
  }

  @Get('trajectories/:id')
  @ApiOperation({
    summary: 'Мониторинг одной ИОТ: этапы, контрольные точки, оценки, динамика, корректировки',
    description: 'Отправная точка корректировки маршрута (FR-061, UC-05).',
  })
  @ApiOkResponse({ type: MonitoringDetailResponseDto })
  detail(
    @Param('id', uuid) id: string,
    @Query() query: MonitoringPeriodQueryDto,
    @User() user: AuthUser,
  ): Promise<MonitoringDetailDto> {
    return this.monitoring.detail(user, id, query);
  }

  @Put('students/:id/support-status')
  @ApiOperation({
    summary: 'Отметка о необходимости дополнительного сопровождения (FR-060)',
    description:
      'Преподаватель, который ведёт студента, меняет статус сопровождения с основанием; изменение пишется в журнал аудита и историю студента.',
  })
  @ApiOkResponse({ type: SupportStatusResponseDto })
  setSupportStatus(
    @Param('id', uuid) id: string,
    @Body() dto: SupportStatusInputDto,
    @User() user: AuthUser,
  ): Promise<SupportStatusDto> {
    return this.monitoring.setSupportStatus(user, id, dto);
  }
}
