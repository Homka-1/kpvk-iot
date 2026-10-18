import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  type StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AssignmentReviewDto,
  type AssignmentWorkDto,
  Permission,
  type ReviewQueueItemDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ApiIdempotencyHeader, IdempotencyKey } from '../common/idempotency.service.js';
import { FilesService } from '../library/files.service.js';
import { attachment } from '../library/library.controller.js';
import {
  AssessAssignmentDto,
  AssignmentReviewResponseDto,
  AssignmentWorkResponseDto,
  ReviewQueueItemResponseDto,
  ReviewQueueQueryDto,
  SubmitAssignmentDto,
} from './submissions.dto.js';
import { SubmissionsService } from './submissions.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Задания')
@ApiBearerAuth()
@Controller('student-assignments')
@RequirePermissions(Permission.STUDENTS_READ, Permission.ASSIGNMENTS_MANAGE)
export class AssignmentReviewController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly files: FilesService,
  ) {}

  @Get('review')
  @ApiOperation({
    summary: 'Очередь «На проверке» (AT-07)',
    description:
      'Отправленные ответы студентов, которых пользователь ведёт (FR-002): сначала те, что ждут дольше.',
  })
  @ApiOkResponse({ type: [ReviewQueueItemResponseDto] })
  queue(
    @Query() query: ReviewQueueQueryDto,
    @User() user: AuthUser,
  ): Promise<ReviewQueueItemDto[]> {
    return this.submissions.reviewQueue(user, query);
  }

  @Get('files/:fileId')
  @ApiOperation({
    summary: 'Скачивание файла из ответа студента',
    description: 'Только ответы студентов, которых пользователь ведёт. Остальные файлы — 404.',
  })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(
    @Param('fileId', uuid) fileId: string,
    @User() user: AuthUser,
  ): Promise<StreamableFile> {
    return attachment(await this.files.readSubmissionFile(user, fileId));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Карточка проверки: задание, студент, критерии и все попытки сдачи (FR-051, FR-052)',
  })
  @ApiOkResponse({ type: AssignmentReviewResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<AssignmentReviewDto> {
    return this.submissions.reviewGet(user, id);
  }

  @Post(':id/assessments')
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Проверка последней попытки: принять или вернуть на доработку (FR-051, FR-052)',
    description:
      'Принятое задание с критериями оценивается по каждому критерию, итог — сумма; оценка попадает в учебные достижения. Возврат требует комментария. Попытка проверяется один раз (409). Студент получает уведомление.',
  })
  @ApiCreatedResponse({ type: AssignmentReviewResponseDto })
  assess(
    @Param('id', uuid) id: string,
    @Body() dto: AssessAssignmentDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<AssignmentReviewDto> {
    return this.submissions.assess(user, id, dto, key);
  }
}

@ApiTags('Кабинет студента')
@ApiBearerAuth()
@Controller('cabinet/assignments')
@RequirePermissions(Permission.CABINET_ACCESS)
export class CabinetSubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post(':id/start')
  @HttpCode(200)
  @ApiOperation({
    summary: '«Приступить к выполнению» своего задания (FR-053)',
    description: 'Назначенное задание становится выполняемым; в другом статусе ничего не меняется.',
  })
  @ApiOkResponse({ type: AssignmentWorkResponseDto })
  start(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<AssignmentWorkDto> {
    return this.submissions.start(user, id);
  }

  @Post(':id/submissions')
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Отправка ответа на проверку: текст, файлы, ссылка (FR-050, FR-051, UC-04)',
    description:
      'Форматы — только разрешённые заданием. Каждая отправка — новая попытка; после возврата на доработку можно отправить снова. Преподаватель получает уведомление.',
  })
  @ApiCreatedResponse({ type: AssignmentWorkResponseDto })
  submit(
    @Param('id', uuid) id: string,
    @Body() dto: SubmitAssignmentDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<AssignmentWorkDto> {
    return this.submissions.submit(user, id, dto, key);
  }
}
