import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  LESSON_IMPORT_MAX_BYTES,
  type LessonDto,
  type LessonImportPreviewDto,
  type LessonImportResultDto,
  type LessonJournalDto,
  type LessonListDto,
  type LessonOptionsDto,
  type ObservationCriterionDto,
  Permission,
  type StudentLessonJournalDto,
} from '@iot/shared';
import {
  type AuthUser,
  RequireAnyPermission,
  RequirePermissions,
  User,
} from '../auth/decorators.js';
import { IdempotencyKey } from '../common/idempotency.service.js';
import {
  LessonImportCommitDto,
  LessonImportPreviewResponseDto,
  LessonImportResultResponseDto,
  LessonInputDto,
  LessonJournalInputDto,
  LessonJournalResponseDto,
  LessonListQueryDto,
  LessonListResponseDto,
  LessonOptionsResponseDto,
  LessonResponseDto,
  ObservationCriteriaInputDto,
  ObservationCriterionResponseDto,
  StudentLessonJournalResponseDto,
} from './lessons.dto.js';
import { LessonsService } from './lessons.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Занятия и журнал наблюдений')
@ApiBearerAuth()
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get()
  @RequireAnyPermission(Permission.LESSONS_MANAGE, Permission.OBSERVATIONS_MANAGE)
  @ApiOperation({
    summary: 'Занятия по расписанию с заполненностью журнала',
    description:
      'Администратору — все занятия, преподавателю — занятия его групп и дисциплин (FR-002). Сначала последние.',
  })
  @ApiOkResponse({ type: LessonListResponseDto })
  list(@Query() query: LessonListQueryDto, @User() user: AuthUser): Promise<LessonListDto> {
    return this.lessons.list(user, {
      groupId: query.groupId ?? undefined,
      disciplineId: query.disciplineId ?? undefined,
      from: query.from ?? undefined,
      to: query.to ?? undefined,
    });
  }

  @Get('options')
  @RequirePermissions(Permission.LESSONS_MANAGE)
  @ApiOperation({ summary: 'Группы, дисциплины и преподаватели для формы занятия' })
  @ApiOkResponse({ type: LessonOptionsResponseDto })
  options(@User() user: AuthUser): Promise<LessonOptionsDto> {
    return this.lessons.options(user);
  }

  @Post()
  @RequirePermissions(Permission.LESSONS_MANAGE)
  @ApiOperation({
    summary: 'Добавление занятия вручную',
    description: 'Преподаватель добавляет занятия только по своим группам и дисциплинам.',
  })
  @ApiCreatedResponse({ type: LessonResponseDto })
  create(@Body() dto: LessonInputDto, @User() user: AuthUser): Promise<LessonDto> {
    return this.lessons.create(user, dto);
  }

  @Post('import/preview')
  @HttpCode(200)
  @RequirePermissions(Permission.LESSONS_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: LESSON_IMPORT_MAX_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV или XLSX до 2 МБ: Дата | Время | Группа | Дисциплина | Преподаватель',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Предпросмотр импорта расписания',
    description:
      'Разбирает файл и сопоставляет группы, дисциплины и преподавателей по названию и ФИО. Ничего не сохраняет.',
  })
  @ApiOkResponse({ type: LessonImportPreviewResponseDto })
  preview(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @User() user: AuthUser,
  ): Promise<LessonImportPreviewDto> {
    return this.lessons.previewImport(user, file);
  }

  @Post('import')
  @RequirePermissions(Permission.LESSONS_MANAGE)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Ключ формы: повторная отправка не создаёт дублей (NFR-006)',
  })
  @ApiOperation({
    summary: 'Импорт расписания после предпросмотра',
    description:
      'Строки проверяются заново; при любой ошибке не создаётся ни одного занятия. Занятия, которые уже есть, пропускаются.',
  })
  @ApiCreatedResponse({ type: LessonImportResultResponseDto })
  import(
    @Body() dto: LessonImportCommitDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<LessonImportResultDto> {
    return this.lessons.commitImport(user, dto.rows, key);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.LESSONS_MANAGE)
  @ApiOperation({
    summary: 'Удаление занятия',
    description: 'Только если в журнале занятия нет записей; иначе 409.',
  })
  @ApiNoContentResponse()
  remove(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<void> {
    return this.lessons.remove(user, id);
  }

  @Get(':id/journal')
  @RequireAnyPermission(Permission.OBSERVATIONS_MANAGE, Permission.LESSONS_MANAGE)
  @ApiOperation({
    summary: 'Журнал педагогических наблюдений на занятии',
    description:
      'Все студенты группы, критерии и оценки 1–5, «Не наблюдалось» (null), отметка «Отсутствовал». Студентам не передаётся (FR-016).',
  })
  @ApiOkResponse({ type: LessonJournalResponseDto })
  journal(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<LessonJournalDto> {
    return this.lessons.journal(user, id);
  }

  @Put(':id/journal')
  @RequirePermissions(Permission.OBSERVATIONS_MANAGE)
  @ApiOperation({
    summary: 'Сохранение журнала занятия',
    description:
      'Журнал передаётся целиком; повторная отправка не создаёт дублей. Изменение записывается в журнал аудита.',
  })
  @ApiOkResponse({ type: LessonJournalResponseDto })
  saveJournal(
    @Param('id', uuid) id: string,
    @Body() dto: LessonJournalInputDto,
    @User() user: AuthUser,
  ): Promise<LessonJournalDto> {
    return this.lessons.saveJournal(user, id, dto);
  }
}

@ApiTags('Занятия и журнал наблюдений')
@ApiBearerAuth()
@Controller('students/:id/lesson-journal')
export class StudentLessonJournalController {
  constructor(private readonly lessons: LessonsService) {}

  @Get()
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Наблюдения о студенте на занятиях',
    description:
      'История по занятиям и средние оценки по критериям; «Не наблюдалось» и пропуски не дают нулей (FR-074). Только сотрудникам.',
  })
  @ApiOkResponse({ type: StudentLessonJournalResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentLessonJournalDto> {
    return this.lessons.studentJournal(user, id);
  }
}

@ApiTags('Настройки')
@ApiBearerAuth()
@Controller('observation-criteria')
@RequirePermissions(Permission.SETTINGS_MANAGE)
export class ObservationCriteriaController {
  constructor(private readonly lessons: LessonsService) {}

  @Get()
  @ApiOperation({ summary: 'Критерии наблюдения на занятиях, включая архивные' })
  @ApiOkResponse({ type: [ObservationCriterionResponseDto] })
  list(): Promise<ObservationCriterionDto[]> {
    return this.lessons.criteria();
  }

  @Put()
  @ApiOperation({
    summary: 'Изменение списка критериев наблюдения',
    description:
      'Передаются все критерии в порядке показа. Критерии не удаляются, а архивируются: оценки сохраняются. Изменение записывается в журнал аудита.',
  })
  @ApiOkResponse({ type: [ObservationCriterionResponseDto] })
  update(@Body() dto: ObservationCriteriaInputDto): Promise<ObservationCriterionDto[]> {
    return this.lessons.updateCriteria(dto.items);
  }
}
