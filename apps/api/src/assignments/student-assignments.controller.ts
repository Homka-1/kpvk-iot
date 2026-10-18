import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AssignTasksResultDto,
  type AssignmentWorkDto,
  type CabinetAssignmentsDto,
  Permission,
  type StudentAssignmentDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import { ApiIdempotencyHeader, IdempotencyKey } from '../common/idempotency.service.js';
import {
  AssignTasksDto,
  AssignTasksResultResponseDto,
  CabinetAssignmentsResponseDto,
  ChooseAssignmentsDto,
  StudentAssignmentResponseDto,
  StudentAssignmentsQueryDto,
} from './student-assignments.dto.js';
import { AssignmentWorkResponseDto } from './submissions.dto.js';
import { StudentAssignmentsService } from './student-assignments.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Задания')
@ApiBearerAuth()
@Controller('student-assignments')
@RequirePermissions(Permission.STUDENTS_READ, Permission.ASSIGNMENTS_MANAGE)
export class StudentAssignmentsController {
  constructor(private readonly assignments: StudentAssignmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Задания студента для вкладки «Задания» профиля',
    description:
      'Действующие назначения по дисциплинам, которые пользователь ведёт в группе студента (FR-002): вне маршрута и в утверждённых ИОТ.',
  })
  @ApiOkResponse({ type: [StudentAssignmentResponseDto] })
  list(
    @Query() query: StudentAssignmentsQueryDto,
    @User() user: AuthUser,
  ): Promise<StudentAssignmentDto[]> {
    return this.assignments.listForStudent(user, query.studentId);
  }

  @Post()
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Назначение заданий студенту, нескольким студентам или группе (FR-048, FR-054)',
    description:
      'Задания — из библиотеки одной дисциплины, которую пользователь ведёт в группе студента. С набором `choice` студент выбирает `requiredCount` заданий из предложенных (FR-054). Студенты, которым задание уже назначено, пропускаются с причиной. Студенты получают уведомление.',
  })
  @ApiCreatedResponse({ type: AssignTasksResultResponseDto })
  assign(
    @Body() dto: AssignTasksDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<AssignTasksResultDto> {
    return this.assignments.assign(user, dto, key);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Отмена ещё не начатого задания, назначенного вне ИОТ, с причиной',
    description:
      'Невыбранный набор на выбор отменяется целиком. Задания этапов ИОТ меняются корректировкой маршрута (409). Начатое задание — 409.',
  })
  @ApiNoContentResponse()
  cancel(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
    @User() user: AuthUser,
  ): Promise<void> {
    return this.assignments.cancel(user, id, dto.reason);
  }
}

@ApiTags('Кабинет студента')
@ApiBearerAuth()
@Controller('cabinet')
@RequirePermissions(Permission.CABINET_ACCESS)
export class CabinetAssignmentsController {
  constructor(private readonly assignments: StudentAssignmentsService) {}

  @Get('assignments')
  @ApiOperation({
    summary: '«Мои задания»: наборы на выбор и назначенные задания (AT-06)',
    description:
      'Только свои действующие назначения. Задания черновика ИОТ и отменённые не показываются.',
  })
  @ApiOkResponse({ type: CabinetAssignmentsResponseDto })
  list(@User() user: AuthUser): Promise<CabinetAssignmentsDto> {
    return this.assignments.cabinetList(user);
  }

  @Get('assignments/:id')
  @ApiOperation({
    summary:
      'Карточка своего задания: инструкция, критерии, ресурсы, срок, формат сдачи, попытки и проверки (п. 4.7)',
  })
  @ApiOkResponse({ type: AssignmentWorkResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<AssignmentWorkDto> {
    return this.assignments.cabinetGet(user, id);
  }

  @Post('assignment-choices/:id/choose')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Выбор из равнозначных заданий (FR-054)',
    description:
      'Выбранные варианты назначаются, остальные отмечаются «Не выбрано». Выбор делается один раз: повторный — 409.',
  })
  @ApiOkResponse({ type: CabinetAssignmentsResponseDto })
  choose(
    @Param('id', uuid) id: string,
    @Body() dto: ChooseAssignmentsDto,
    @User() user: AuthUser,
  ): Promise<CabinetAssignmentsDto> {
    return this.assignments.choose(user, id, dto.optionIds);
  }
}
