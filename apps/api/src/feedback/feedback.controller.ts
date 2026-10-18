import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CabinetConsultationDto,
  type CabinetFeedbackDto,
  type ConsultationDto,
  type FeedbackDto,
  Permission,
  type ReflectionDto,
  type StudentSupportDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import { ApiIdempotencyHeader, IdempotencyKey } from '../common/idempotency.service.js';
import { ConsultationsService } from './consultations.service.js';
import {
  CabinetConsultationInputDto,
  CabinetConsultationResponseDto,
  CabinetFeedbackInputDto,
  CabinetFeedbackResponseDto,
  CabinetReplyInputDto,
  ConsultationListQueryDto,
  ConsultationResponseDto,
  CreateConsultationDto,
  CreateFeedbackDto,
  FeedbackListQueryDto,
  FeedbackReplyInputDto,
  FeedbackResponseDto,
  HoldConsultationDto,
  ReflectionInputDto,
  ReflectionResponseDto,
  ScheduleConsultationDto,
  StudentSupportResponseDto,
} from './feedback.dto.js';
import { FeedbackService } from './feedback.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Обратная связь')
@ApiBearerAuth()
@Controller('feedback')
@RequirePermissions(Permission.STUDENTS_READ, Permission.FEEDBACK_MANAGE)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ApiOperation({
    summary: 'Сообщения и обращения студентов (FR-063, FR-064)',
    description:
      'Ветки обратной связи студентов в области пользователя (FR-002) с ответами, включая внутренние заметки. Фильтры: группа, дисциплина, студент, задание, источник, только нерассмотренные.',
  })
  @ApiOkResponse({ type: [FeedbackResponseDto] })
  list(@Query() query: FeedbackListQueryDto, @User() user: AuthUser): Promise<FeedbackDto[]> {
    return this.feedback.list(user, query);
  }

  @Post()
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Сообщение студенту или внутренняя заметка (п. 4.9, FR-064, FR-068)',
    description:
      'Рекомендация, комментарий, краткосрочная цель или запрос самооценки с привязкой к студенту, ИОТ, этапу или заданию. Видимое студенту сообщение создаёт уведомление (FR-065); внутренняя заметка студенту не передаётся.',
  })
  @ApiCreatedResponse({ type: FeedbackResponseDto })
  create(
    @Body() dto: CreateFeedbackDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<FeedbackDto> {
    return this.feedback.create(user, dto, key);
  }

  @Post(':id/replies')
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Ответ преподавателя в ветке обратной связи' })
  @ApiCreatedResponse({ type: FeedbackResponseDto })
  reply(
    @Param('id', uuid) id: string,
    @Body() dto: FeedbackReplyInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<FeedbackDto> {
    return this.feedback.reply(user, id, dto, key);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Отметить обращение студента рассмотренным',
    description: 'Вопрос, затруднение или предложение изменить маршрут; пишется в журнал аудита.',
  })
  @ApiOkResponse({ type: FeedbackResponseDto })
  resolve(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<FeedbackDto> {
    return this.feedback.resolve(user, id);
  }
}

@ApiTags('Обратная связь')
@ApiBearerAuth()
@Controller('students/:id/support')
@RequirePermissions(Permission.STUDENTS_READ, Permission.FEEDBACK_MANAGE)
export class StudentSupportController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ApiOperation({
    summary: 'История взаимодействия со студентом (FR-063, FR-067)',
    description:
      'Сообщения с ответами, консультации и рефлексия студента — для вкладки «Сопровождение» профиля. Только сотрудникам с доступом к студенту.',
  })
  @ApiOkResponse({ type: StudentSupportResponseDto })
  support(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentSupportDto> {
    return this.feedback.support(user, id);
  }
}

@ApiTags('Обратная связь')
@ApiBearerAuth()
@Controller('consultations')
@RequirePermissions(Permission.STUDENTS_READ, Permission.FEEDBACK_MANAGE)
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Консультации студентов: запросы, назначенные, история (FR-067)',
    description:
      'В области пользователя (FR-002), с фильтрами по группе, дисциплине, студенту и статусу.',
  })
  @ApiOkResponse({ type: [ConsultationResponseDto] })
  list(
    @Query() query: ConsultationListQueryDto,
    @User() user: AuthUser,
  ): Promise<ConsultationDto[]> {
    return this.consultations.list(user, query);
  }

  @Post()
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Назначение консультации студенту (п. 4.9, UC-05)',
    description: 'Студент получает уведомление с темой и временем (FR-065).',
  })
  @ApiCreatedResponse({ type: ConsultationResponseDto })
  create(
    @Body() dto: CreateConsultationDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<ConsultationDto> {
    return this.consultations.create(user, dto, key);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  @ApiOperation({ summary: 'Назначить время запрошенной консультации или перенести назначенную' })
  @ApiOkResponse({ type: ConsultationResponseDto })
  schedule(
    @Param('id', uuid) id: string,
    @Body() dto: ScheduleConsultationDto,
    @User() user: AuthUser,
  ): Promise<ConsultationDto> {
    return this.consultations.schedule(user, id, dto);
  }

  @Post(':id/held')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Фиксация проведённой консультации (FR-067)',
    description: 'Итог виден студенту, внутренняя заметка — только преподавателям (FR-068).',
  })
  @ApiOkResponse({ type: ConsultationResponseDto })
  hold(
    @Param('id', uuid) id: string,
    @Body() dto: HoldConsultationDto,
    @User() user: AuthUser,
  ): Promise<ConsultationDto> {
    return this.consultations.hold(user, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Отмена консультации с причиной (в журнал аудита)' })
  @ApiOkResponse({ type: ConsultationResponseDto })
  cancel(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
    @User() user: AuthUser,
  ): Promise<ConsultationDto> {
    return this.consultations.cancel(user, id, dto);
  }
}

@ApiTags('Кабинет студента')
@ApiBearerAuth()
@Controller('cabinet/feedback')
@RequirePermissions(Permission.CABINET_ACCESS)
export class CabinetFeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly consultations: ConsultationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '«Обратная связь» студента: рекомендации, цели, консультации, рефлексия (п. 4.9)',
    description:
      'Только собственные записи студента, открытые ему; внутренние заметки и служебные поля консультаций не передаются (FR-016, FR-068, AT-12).',
  })
  @ApiOkResponse({ type: CabinetFeedbackResponseDto })
  get(@User() user: AuthUser): Promise<CabinetFeedbackDto> {
    return this.feedback.cabinet(user);
  }

  @Post()
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Вопрос или сообщение о затруднении (п. 4.9)',
    description:
      'Привязка к ИОТ, этапу или заданию необязательна (FR-064). Преподаватель получает уведомление.',
  })
  @ApiCreatedResponse({ type: FeedbackResponseDto })
  ask(
    @Body() dto: CabinetFeedbackInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<FeedbackDto> {
    return this.feedback.ask(user, dto, key);
  }

  @Post(':id/replies')
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Ответ студента в своей ветке обратной связи' })
  @ApiCreatedResponse({ type: FeedbackResponseDto })
  reply(
    @Param('id', uuid) id: string,
    @Body() dto: CabinetReplyInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<FeedbackDto> {
    return this.feedback.studentReply(user, id, dto, key);
  }

  @Post('consultations')
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Запрос консультации (п. 4.9)' })
  @ApiCreatedResponse({ type: CabinetConsultationResponseDto })
  requestConsultation(
    @Body() dto: CabinetConsultationInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<CabinetConsultationDto> {
    return this.consultations.request(user, dto, key);
  }

  @Post('reflections')
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Рефлексия после контрольной точки или ответ на запрос самооценки (FR-066)',
    description:
      'Одна рефлексия на контрольную точку, отмеченную пройденной или пропущенной; ответ на запрос самооценки закрывает запрос.',
  })
  @ApiCreatedResponse({ type: ReflectionResponseDto })
  reflect(
    @Body() dto: ReflectionInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<ReflectionDto> {
    return this.feedback.reflect(user, dto, key);
  }
}
