import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type MotivationProfileDto,
  type MotivationStrategiesDto,
  Permission,
  type ProfileDistributionDto,
  type StudentMotivationDto,
} from '@iot/shared';
import {
  type AuthUser,
  RequireAnyPermission,
  RequirePermissions,
  User,
} from '../auth/decorators.js';
import { IdempotencyKey } from '../common/idempotency.service.js';
import {
  DistributionQueryDto,
  MotivationProfileResponseDto,
  MotivationStrategiesBodyDto,
  MotivationStrategiesResponseDto,
  ProfileDecisionDto,
  ProfileDistributionResponseDto,
  StudentMotivationResponseDto,
} from './motivation-profiles.dto.js';
import { MotivationProfilesService } from './motivation-profiles.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Мотивационные профили')
@ApiBearerAuth()
@Controller('students/:id')
export class StudentMotivationController {
  constructor(private readonly profiles: MotivationProfilesService) {}

  @Get('motivation-profile')
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Мотивационный профиль студента: текущая запись, последний утверждённый и история',
    description:
      'Основания профиля (FR-028) и история изменений (FR-032). Только студенты доступных групп (FR-002); иначе 404.',
  })
  @ApiOkResponse({ type: StudentMotivationResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentMotivationDto> {
    return this.profiles.getForStudent(user, id);
  }

  @Post('motivation-profiles')
  @RequirePermissions(Permission.STUDENTS_READ, Permission.PROFILES_MANAGE)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Ключ формы: повторная отправка не создаёт дублей (NFR-006)',
  })
  @ApiOperation({
    summary: 'Формирование предварительного профиля по правилам интерпретации (FR-027, AT-03)',
    description:
      'Берётся последнее завершённое прохождение каждой методики. Если у версии методики заданы шкалы внутренней мотивации, уровень методики считается только по ним: среднее внутренних шкал (≥ 4,0 высокий, 3,0–3,9 средний, < 3,0 низкий), если шкалы — средние по пунктам, иначе процент от максимума (≥ 67 % высокий, 34–66 % средний, < 34 % низкий); внешние шкалы уровень не повышают, при их преобладании — предупреждение. Уровни методик сводятся: совпали — этот уровень, разница в одну ступень — более низкий, «высокий» и «низкий» или одна методика — статус «Требуется дополнительная диагностика». Версии без ролей шкал считаются прежним правилом: большинство шкал с уровнем профиля в правилах интерпретации, не меньше настройки «profiles.minScales». Если данные не изменились, возвращается текущая запись.',
  })
  @ApiCreatedResponse({ type: MotivationProfileResponseDto })
  form(
    @Param('id', uuid) id: string,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<MotivationProfileDto> {
    return this.profiles.form(user, id, key);
  }
}

@ApiTags('Мотивационные профили')
@ApiBearerAuth()
@Controller('motivation-profiles')
@RequirePermissions(Permission.STUDENTS_READ, Permission.PROFILES_MANAGE)
export class MotivationProfilesController {
  constructor(private readonly profiles: MotivationProfilesService) {}

  @Get('distribution')
  @ApiOperation({
    summary: 'Распределение текущих профилей в доступной области (раздел «Мотивационные профили»)',
    description:
      'Только действующие студенты групп пользователя; фильтры — рабочий контекст шапки.',
  })
  @ApiOkResponse({ type: ProfileDistributionResponseDto })
  distribution(
    @Query() query: DistributionQueryDto,
    @User() user: AuthUser,
  ): Promise<ProfileDistributionDto> {
    return this.profiles.distribution(user, query);
  }

  @Post(':profileId/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Подтверждение или корректировка предложенного профиля (FR-029, AT-04)',
    description:
      'Уровень, совпадающий с предложенным, — подтверждение; другой уровень — корректировка с обязательной причиной. Профиль без предложенного уровня («Требуется дополнительная диагностика») и уже решённый профиль — 409.',
  })
  @ApiOkResponse({ type: MotivationProfileResponseDto })
  decide(
    @Param('profileId', uuid) profileId: string,
    @Body() dto: ProfileDecisionDto,
    @User() user: AuthUser,
  ): Promise<MotivationProfileDto> {
    return this.profiles.decide(user, profileId, dto);
  }
}

@ApiTags('Мотивационные профили')
@ApiBearerAuth()
@Controller('motivation-strategies')
export class MotivationStrategiesController {
  constructor(private readonly profiles: MotivationProfilesService) {}

  @Get()
  @RequireAnyPermission(Permission.PROFILES_MANAGE, Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Стратегии сопровождения для трёх уровней профиля (FR-030)' })
  @ApiOkResponse({ type: MotivationStrategiesResponseDto })
  get(): Promise<MotivationStrategiesDto> {
    return this.profiles.getStrategies();
  }

  @Put()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Изменение текстов стратегий сопровождения (раздел «Настройки»)',
    description: 'Изменение записывается в журнал аудита.',
  })
  @ApiOkResponse({ type: MotivationStrategiesResponseDto })
  update(
    @Body() dto: MotivationStrategiesBodyDto,
    @User() user: AuthUser,
  ): Promise<MotivationStrategiesDto> {
    return this.profiles.updateStrategies(dto, user.id);
  }
}
