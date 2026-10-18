import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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
  type CabinetTrajectoryDto,
  Permission,
  type RouteProposalDto,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
  type TrajectoryPageDto,
  type TrajectoryVersionDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ApiIdempotencyHeader, IdempotencyKey } from '../common/idempotency.service.js';
import {
  CabinetTrajectoryResponseDto,
  CheckpointStatusDto,
  CompleteTrajectoryDto,
  CreateTrajectoryDto,
  RouteProposalInputDto,
  RouteProposalResponseDto,
  TrajectoryReasonDto,
  RevisionTokenDto,
  TrajectoryContentDto,
  TrajectoryCorrectionDto,
  TrajectoryListQueryDto,
  TrajectoryOptionsResponseDto,
  TrajectoryPageResponseDto,
  TrajectoryResponseDto,
  TrajectoryVersionResponseDto,
} from './trajectories.dto.js';
import { TrajectoriesService } from './trajectories.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });
const versionNumber = new ParseIntPipe({ errorHttpStatusCode: 404 });

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

@ApiTags('Кабинет студента')
@ApiBearerAuth()
@Controller('cabinet/trajectories')
@RequirePermissions(Permission.CABINET_ACCESS)
export class CabinetTrajectoriesController {
  constructor(private readonly trajectories: TrajectoriesService) {}

  @Get()
  @ApiOperation({
    summary: '«Моя траектория»: утверждённые ИОТ студента с картой этапов (FR-040, FR-041, AT-06)',
    description:
      'Только свои маршруты в статусах «Активна», «Требует корректировки», «Завершена». Черновики и маршруты на согласовании не показываются; история версий и служебные поля не передаются. Материалы этапов — с содержимым.',
  })
  @ApiOkResponse({ type: [CabinetTrajectoryResponseDto] })
  list(@User() user: AuthUser): Promise<CabinetTrajectoryDto[]> {
    return this.trajectories.cabinetList(user);
  }

  @Post(':id/proposals')
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Предложение изменить маршрут (п. 2.3)',
    description:
      'Студент описывает, что хотел бы изменить (при необходимости — в каком этапе). Маршрут не меняется: предложение получает преподаватель, решение за ним. Завершённый маршрут — 409.',
  })
  @ApiCreatedResponse({ type: RouteProposalResponseDto })
  propose(
    @Param('id', uuid) id: string,
    @Body() dto: RouteProposalInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<RouteProposalDto> {
    return this.trajectories.propose(user, id, dto, key);
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

  @Post(':id/corrections')
  @HttpCode(200)
  @RequirePermissions(
    Permission.STUDENTS_READ,
    Permission.TRAJECTORIES_MANAGE,
    Permission.TRAJECTORIES_APPROVE,
  )
  @ApiOperation({
    summary: 'Корректировка ИОТ новой версией с причиной (FR-043, UC-05, AT-09)',
    description:
      'Статусы «Активна» и «Требует корректировки». Тело — полное содержимое маршрута (как при сохранении черновика) и причина. Новая версия утверждается сразу, поэтому нужно и право «Утверждение ИОТ» (FR-039). Прежняя версия остаётся неизменным снимком; маршрут — «Активна»; студент получает уведомление. Убранный этап архивируется, убранное задание отменяется. Нельзя убрать начатые и выполненные задания, этап с ними и отмеченные контрольные точки, заменить задание в назначении (400 с полями). Устаревшая редакция — 409.',
  })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  correct(
    @Param('id', uuid) id: string,
    @Body() dto: TrajectoryCorrectionDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.correct(user, id, dto);
  }

  @Post(':id/needs-correction')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Отметка «Требует корректировки» по итогам мониторинга (UC-05)',
    description: 'Только из статуса «Активна»; причина пишется в журнал аудита.',
  })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  markNeedsCorrection(
    @Param('id', uuid) id: string,
    @Body() dto: TrajectoryReasonDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.markNeedsCorrection(user, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Завершение маршрута с итоговой оценкой достижения целей (FR-044)',
    description:
      'Только из статуса «Активна». Если есть ответы на проверке — 409. Незавершённые задания маршрута отменяются; студент получает уведомление и видит итоговую оценку.',
  })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  complete(
    @Param('id', uuid) id: string,
    @Body() dto: CompleteTrajectoryDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.complete(user, id, dto);
  }

  @Get(':id/versions/:version')
  @ApiOperation({
    summary: 'Версия маршрута со снимком — история версий и сравнение (FR-043)',
  })
  @ApiOkResponse({ type: TrajectoryVersionResponseDto })
  version(
    @Param('id', uuid) id: string,
    @Param('version', versionNumber) version: number,
    @User() user: AuthUser,
  ): Promise<TrajectoryVersionDto> {
    return this.trajectories.version(user, id, version);
  }

  @Post(':id/checkpoints/:checkpointId/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Отметка контрольной точки действующего маршрута (п. 4.8, FR-058)',
    description:
      'Пройдена, пропущена или снова ожидается. Версия маршрута не меняется. Этап без заданий завершается, когда пройдены все его контрольные точки.',
  })
  @ApiOkResponse({ type: TrajectoryResponseDto })
  markCheckpoint(
    @Param('id', uuid) id: string,
    @Param('checkpointId', uuid) checkpointId: string,
    @Body() dto: CheckpointStatusDto,
    @User() user: AuthUser,
  ): Promise<TrajectoryDto> {
    return this.trajectories.markCheckpoint(user, id, checkpointId, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Перенос черновика или завершённой ИОТ в архив с причиной',
    description: 'Незавершённые задания черновика отменяются. Действующую ИОТ сначала завершают.',
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
