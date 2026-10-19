import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AnalyticsDto, Permission } from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { AnalyticsQueryDto, AnalyticsResponseDto } from './analytics.dto.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('Аналитика')
@ApiBearerAuth()
@Controller('analytics')
@RequirePermissions(Permission.ANALYTICS_READ, Permission.STUDENTS_READ)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOperation({
    summary: 'Аналитика по студентам преподавателя (п. 4.10; FR-069, FR-070)',
    description:
      'Выполнение ИОТ, академическая успешность и её динамика, учебная активность (без учёта входов, FR-062), распределение профилей, результативность заданий, динамика мотивации и сравнение до и после сопровождения. По каждому показателю — описательные статистики (n, среднее, медиана, SD, минимум, квартили, максимум) в целом и по учебным группам. Пропуски не заменяются нулями (FR-074), незавершённые прохождения исключаются и считаются отдельно (FR-073). Только студенты области пользователя (FR-002).',
  })
  @ApiOkResponse({ type: AnalyticsResponseDto })
  overview(@Query() query: AnalyticsQueryDto, @User() user: AuthUser): Promise<AnalyticsDto> {
    return this.analytics.overview(user, query);
  }
}
