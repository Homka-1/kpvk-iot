import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CabinetDiagnosticDto,
  type CabinetDiagnosticSessionDto,
  type DiagnosticAnswersDto,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticAssignmentDto,
  type DiagnosticForm,
  Permission,
  type StudentDiagnosticDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import { IdempotencyKey } from '../common/idempotency.service.js';
import {
  AnswersDto,
  CabinetDiagnosticResponseDto,
  CabinetDiagnosticSessionResponseDto,
  CorrectionDto,
  CreateAssignmentDto,
  DiagnosticAnswersResponseDto,
  DiagnosticAssignmentDetailResponseDto,
  DiagnosticAssignmentResponseDto,
  DiagnosticFormResponseDto,
  DraftSavedResponseDto,
  PaperEntryDto,
  StudentDiagnosticResponseDto,
} from './sessions.dto.js';
import { DiagnosticSessionsService } from './sessions.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: true,
  description: 'Ключ повторной отправки формы (NFR-006): повтор с тем же ключом не создаёт дубль',
};

@ApiTags('Диагностика: проведение')
@ApiBearerAuth()
@Controller('diagnostic-assignments')
@RequirePermissions(Permission.DIAGNOSTICS_MANAGE)
export class DiagnosticAssignmentsController {
  constructor(private readonly sessions: DiagnosticSessionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Назначения диагностики',
    description:
      'Назначения групп и студентов, доступных пользователю (FR-002), с числом прохождений по статусам.',
  })
  @ApiOkResponse({ type: [DiagnosticAssignmentResponseDto] })
  list(@User() user: AuthUser): Promise<DiagnosticAssignmentDto[]> {
    return this.sessions.listAssignments(user);
  }

  @Post()
  @ApiOperation({
    summary: 'Назначение методики группе или студенту (FR-018, FR-019; UC-01)',
    description:
      'Назначается действующая версия методики. Для каждого студента создаётся прохождение, студенту — уведомление.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: DiagnosticAssignmentDetailResponseDto })
  create(
    @Body() dto: CreateAssignmentDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<DiagnosticAssignmentDetailDto> {
    return this.sessions.createAssignment(user, dto, key);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Назначение и прохождения студентов' })
  @ApiOkResponse({ type: DiagnosticAssignmentDetailResponseDto })
  get(
    @Param('id', uuid) id: string,
    @User() user: AuthUser,
  ): Promise<DiagnosticAssignmentDetailDto> {
    return this.sessions.getAssignment(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Отмена назначения',
    description: 'Незавершённые прохождения отменяются; завершённые результаты сохраняются.',
  })
  @ApiOkResponse({ type: DiagnosticAssignmentDetailResponseDto })
  cancel(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
    @User() user: AuthUser,
  ): Promise<DiagnosticAssignmentDetailDto> {
    return this.sessions.cancelAssignment(user, id, dto.reason);
  }
}

@ApiTags('Диагностика: проведение')
@ApiBearerAuth()
@Controller('diagnostic-sessions/:id')
export class DiagnosticSessionsController {
  constructor(private readonly sessions: DiagnosticSessionsService) {}

  @Get('form')
  @RequirePermissions(Permission.DIAGNOSTICS_MANAGE)
  @ApiOperation({ summary: 'Вопросы методики прохождения (для ввода бумажного бланка)' })
  @ApiOkResponse({ type: DiagnosticFormResponseDto })
  form(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<DiagnosticForm> {
    return this.sessions.getForm(user, id);
  }

  @Post('paper')
  @RequirePermissions(Permission.DIAGNOSTICS_MANAGE)
  @ApiOperation({
    summary: 'Ручной ввод результатов бумажной диагностики (FR-022)',
    description:
      'Ответы проверяются и рассчитываются так же, как при онлайн-прохождении. Доступно и после окончания срока.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: StudentDiagnosticResponseDto })
  paper(
    @Param('id', uuid) id: string,
    @Body() dto: PaperEntryDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<StudentDiagnosticDto> {
    return this.sessions.enterPaper(user, id, dto, key);
  }

  @Get('answers')
  @RequirePermissions(Permission.DIAGNOSTIC_ANSWERS_READ)
  @ApiOperation({
    summary: 'Исходные ответы и ревизии результатов',
    description:
      'Требует разрешения на доступ к диагностическим ответам; у администратора его нет (п. 2.1 ТЗ).',
  })
  @ApiOkResponse({ type: DiagnosticAnswersResponseDto })
  answers(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<DiagnosticAnswersDto> {
    return this.sessions.getAnswers(user, id);
  }

  @Post('corrections')
  @RequirePermissions(Permission.DIAGNOSTICS_MANAGE, Permission.DIAGNOSTIC_ANSWERS_READ)
  @ApiOperation({
    summary: 'Исправление ошибочного ввода (FR-013)',
    description:
      'Новая ревизия с полным набором ответов и причиной. Прежние ответы и баллы сохраняются; расчёт по той же версии методики.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: StudentDiagnosticResponseDto })
  correct(
    @Param('id', uuid) id: string,
    @Body() dto: CorrectionDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<StudentDiagnosticDto> {
    return this.sessions.correct(user, id, dto.answers, dto.reason, key);
  }
}

@ApiTags('Диагностика: проведение')
@ApiBearerAuth()
@Controller('students/:id/diagnostics')
@RequirePermissions(Permission.STUDENTS_READ)
export class StudentDiagnosticsController {
  constructor(private readonly sessions: DiagnosticSessionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Диагностика студента: прохождения и результаты по шкалам (FR-023)',
    description: 'Методика, версия, даты, время прохождения и баллы действующей ревизии.',
  })
  @ApiOkResponse({ type: [StudentDiagnosticResponseDto] })
  list(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentDiagnosticDto[]> {
    return this.sessions.listForStudent(user, id);
  }
}

@ApiTags('Кабинет студента')
@ApiBearerAuth()
@Controller('cabinet/diagnostics')
@RequirePermissions(Permission.CABINET_ACCESS)
export class CabinetDiagnosticsController {
  constructor(private readonly sessions: DiagnosticSessionsService) {}

  @Get()
  @ApiOperation({ summary: 'Мои диагностики: назначенные и пройденные' })
  @ApiOkResponse({ type: [CabinetDiagnosticResponseDto] })
  list(@User() user: AuthUser): Promise<CabinetDiagnosticDto[]> {
    return this.sessions.cabinetList(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Опросник: инструкция, вопросы и сохранённый черновик (UC-01)' })
  @ApiOkResponse({ type: CabinetDiagnosticSessionResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<CabinetDiagnosticSessionDto> {
    return this.sessions.cabinetGet(user, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Начало прохождения после чтения инструкции' })
  @ApiOkResponse({ type: CabinetDiagnosticSessionResponseDto })
  start(
    @Param('id', uuid) id: string,
    @User() user: AuthUser,
  ): Promise<CabinetDiagnosticSessionDto> {
    return this.sessions.start(user, id);
  }

  @Put(':id/draft')
  @ApiOperation({
    summary: 'Автосохранение черновика ответов',
    description: 'Если методика допускает черновик (UC-01, альтернативный сценарий).',
  })
  @ApiOkResponse({ type: DraftSavedResponseDto })
  draft(
    @Param('id', uuid) id: string,
    @Body() dto: AnswersDto,
    @User() user: AuthUser,
  ): Promise<{ savedAt: string }> {
    return this.sessions.saveDraft(user, id, dto.answers);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Завершение диагностики (UC-01, шаги 8–9)',
    description:
      'Проверка полноты, расчёт по утверждённым ключам, сохранение ответов и времени прохождения. После завершения ответы не изменяются.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: CabinetDiagnosticResponseDto })
  complete(
    @Param('id', uuid) id: string,
    @Body() dto: AnswersDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<CabinetDiagnosticDto> {
    return this.sessions.complete(user, id, dto.answers, key);
  }
}
