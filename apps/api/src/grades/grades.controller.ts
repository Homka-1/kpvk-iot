import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
  GRADE_IMPORT_MAX_BYTES,
  type GradeImportDto,
  type GradeImportPreviewDto,
  type GradeImportResultDto,
  type GradeOptionsDto,
  type GroupGradesDto,
  Permission,
  type StudentGradesDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { IdempotencyKey } from '../common/idempotency.service.js';
import {
  GradeImportCommitDto,
  GradeImportPreviewResponseDto,
  GradeImportResponseDto,
  GradeImportResultResponseDto,
  GradeOptionsResponseDto,
  GroupGradesQueryDto,
  GroupGradesResponseDto,
  StudentGradesResponseDto,
} from './grades.dto.js';
import { GradesService } from './grades.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Академическая успешность')
@ApiBearerAuth()
@Controller('grades')
export class GradesController {
  constructor(private readonly grades: GradesService) {}

  @Get('options')
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({ summary: 'Семестры с оценками и доступные группы' })
  @ApiOkResponse({ type: GradeOptionsResponseDto })
  options(@User() user: AuthUser): Promise<GradeOptionsDto> {
    return this.grades.options(user);
  }

  @Get('group')
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Успеваемость группы за семестр',
    description:
      'Общий балл студентов (среднее средних по дисциплинам) и средний балл группы по дисциплинам; при выборе второго семестра — сравнение. Нет оценок — null, а не ноль (FR-074).',
  })
  @ApiOkResponse({ type: GroupGradesResponseDto })
  group(@Query() query: GroupGradesQueryDto, @User() user: AuthUser): Promise<GroupGradesDto> {
    return this.grades.groupGrades(user, {
      groupId: query.groupId,
      periodId: query.periodId,
      compareWith: query.compareWith ?? undefined,
    });
  }

  @Post('import/preview')
  @HttpCode(200)
  @RequirePermissions(Permission.GRADES_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: GRADE_IMPORT_MAX_BYTES, files: 1 } }),
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
          description:
            'CSV или XLSX до 2 МБ: ФИО | Группа | Учебный год | Семестр | Дисциплина | Оценка',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Предпросмотр импорта оценок за семестр',
    description:
      'Разбирает файл, сопоставляет студентов по ФИО внутри группы, дисциплины — по названию. Ничего не сохраняет.',
  })
  @ApiOkResponse({ type: GradeImportPreviewResponseDto })
  preview(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @User() user: AuthUser,
  ): Promise<GradeImportPreviewDto> {
    return this.grades.previewImport(user, file);
  }

  @Post('import')
  @RequirePermissions(Permission.GRADES_MANAGE)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Ключ формы: повторная отправка не создаёт дублей (NFR-006)',
  })
  @ApiOperation({
    summary: 'Импорт оценок после предпросмотра',
    description:
      'Строки проверяются заново; при любой ошибке не сохраняется ни одной оценки. Повторная загрузка тех же оценок отклоняется (409). Изменение записывается в журнал аудита.',
  })
  @ApiCreatedResponse({ type: GradeImportResultResponseDto })
  import(
    @Body() dto: GradeImportCommitDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<GradeImportResultDto> {
    return this.grades.commitImport(user, dto, key);
  }

  @Get('imports')
  @RequirePermissions(Permission.GRADES_MANAGE)
  @ApiOperation({
    summary: 'Загрузки оценок',
    description: 'Администратору — все загрузки, преподавателю — свои. Сначала последние.',
  })
  @ApiOkResponse({ type: [GradeImportResponseDto] })
  imports(@User() user: AuthUser): Promise<GradeImportDto[]> {
    return this.grades.imports(user);
  }

  @Delete('imports/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.GRADES_MANAGE)
  @ApiOperation({
    summary: 'Отмена загрузки оценок',
    description:
      'Оценки загрузки удаляются, загрузка остаётся в списке как отменённая. Отменяет автор или администратор; действие записывается в журнал аудита.',
  })
  @ApiNoContentResponse()
  cancel(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<void> {
    return this.grades.cancelImport(user, id);
  }
}

@ApiTags('Академическая успешность')
@ApiBearerAuth()
@Controller('students/:id/grades')
export class StudentGradesController {
  constructor(private readonly grades: GradesService) {}

  @Get()
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Оценки студента по семестрам',
    description:
      'Исходные оценки, средний балл по дисциплинам и общий балл за каждый семестр. Только сотрудникам.',
  })
  @ApiOkResponse({ type: StudentGradesResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentGradesDto> {
    return this.grades.studentGrades(user, id);
  }
}
