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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Permission,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
  type TrajectoryPageDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ApiIdempotencyHeader, IdempotencyKey } from '../common/idempotency.service.js';
import {
  CreateTrajectoryDto,
  TrajectoryReasonDto,
  RevisionTokenDto,
  TrajectoryContentDto,
  TrajectoryListQueryDto,
  TrajectoryOptionsResponseDto,
  TrajectoryPageResponseDto,
  TrajectoryResponseDto,
} from './trajectories.dto.js';
import { TrajectoriesService } from './trajectories.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Индивидуальные траектории')
@ApiBearerAuth()
@Controller('students/:id/trajectory-options')
export class TrajectoryOptionsController {
  constructor(private readonly trajectories: TrajectoriesService) {}

  @Get()
  @RequirePermissions(Permission.STUDENTS_READ, Permission.TRAJECTORIES_MANAGE)
  @ApiOperation({
    summary: 'Начало конструктора ИОТ: дисциплины, профиль, шаблоны и предложенный шаблон',
    description:
      'Дисциплины — те, что пользователь ведёт в группе студента (FR-002). Шаблон предлагается по последнему утверждённому мотивационному профилю (FR-035); это подсказка, выбор за преподавателем. `blockedReason` — почему ИОТ создать нельзя (архив, контрольная группа исследования).',
  })
  @ApiOkResponse({ type: TrajectoryOptionsResponseDto })
  options(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<TrajectoryOptionsDto> {
    return this.trajectories.options(user, id);
  }
}

@ApiTags('Индивидуальные траектории')
@ApiBearerAuth()
@Controller('trajectories')
@RequirePermissions(Permission.STUDENTS_READ, Permission.TRAJECTORIES_MANAGE)
export class TrajectoriesController {
  constructor(private readonly trajectories: TrajectoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'ИОТ студентов доступных групп и дисциплин (FR-002, FR-045)',
    description: 'Без фильтра по статусу архивные маршруты не показываются.',
  })
  @ApiOkResponse({ type: TrajectoryPageResponseDto })
  list(@Query() query: TrajectoryListQueryDto, @User() user: AuthUser): Promise<TrajectoryPageDto> {
    return this.trajectories.list(user, query);
  }

  @Post()
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Создание черновика ИОТ из шаблона или с нуля (FR-034, UC-03)',
    description:
      'Этапы шаблона копируются в маршрут; способы сопровождения заполняются стратегией утверждённого профиля. По одной дисциплине у студента не более одной действующей ИОТ (409); по разным — несколько (FR-045). Студенту контрольной группы исследования — 403 (огр. 4).',
  })
  @ApiCreatedResponse({ type: TrajectoryResponseDto })
  create(
    @Body() dto: CreateTrajectoryDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<TrajectoryDto> {
    return this.trajectories.create(user, dto, key);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Паспорт ИОТ с этапами, контрольными точками, материалами и заданиями' })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<TrajectoryDto> {
    return this.trajectories.get(user, id);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Сохранение черновика: цели, сроки, этапы, задания, материалы, сопровождение (FR-036, FR-037)',
    description:
      'Только статус «Черновик». Этапы, контрольные точки и задания с `id` изменяются, без `id` — создаются, отсутствующие — удаляются. Материалы и задания — из библиотеки дисциплины маршрута, новые архивные не добавляются. Метка `updatedAt` должна совпадать с текущей редакцией, иначе 409.',
  })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: TrajectoryContentDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.update(user, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Отправка на дополнительное согласование («На утверждении»)',
    description: 'Маршрут должен быть заполнен полностью (те же проверки, что перед утверждением).',
  })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  submit(
    @Param('id', uuid) id: string,
    @Body() dto: RevisionTokenDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.submit(user, id, dto);
  }

  @Post(':id/return')
  @HttpCode(200)
  @RequirePermissions(Permission.STUDENTS_READ, Permission.TRAJECTORIES_APPROVE)
  @ApiOperation({ summary: 'Возврат маршрута «На утверждении» на доработку с причиной' })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  returnToDraft(
    @Param('id', uuid) id: string,
    @Body() dto: TrajectoryReasonDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.returnToDraft(user, id, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(Permission.STUDENTS_READ, Permission.TRAJECTORIES_APPROVE)
  @ApiOperation({
    summary: 'Утверждение и назначение ИОТ (FR-039, UC-03, AT-05)',
    description:
      'Только преподаватель с правом «Утверждение ИОТ». Маршрут переходит в «Активна», фиксируется версия со снимком, профиль на момент назначения и задания этапов назначаются студенту; студент получает уведомление. Незаполненный маршрут — 400 с перечнем полей; чужая или устаревшая редакция — 409; контрольная группа исследования — 403.',
  })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  approve(
    @Param('id', uuid) id: string,
    @Body() dto: RevisionTokenDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.approve(user, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Перенос черновика ИОТ в архив с причиной',
    description:
      'Задания черновика отменяются. Действующую ИОТ архивируют после завершения (этап 14).',
  })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  archive(
    @Param('id', uuid) id: string,
    @Body() dto: TrajectoryReasonDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.archive(user, id, dto);
  }
}
