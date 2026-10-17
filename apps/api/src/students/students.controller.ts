import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Permission,
  STUDENT_IMPORT_MAX_BYTES,
  type StudentCreatedDto,
  type StudentDetailsDto,
  type StudentImportPreviewDto,
  type StudentImportResultDto,
  type StudentPageDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import { IdempotencyKey } from '../common/idempotency.service.js';
import {
  CreateStudentDto,
  ImportCommitDto,
  ImportPreviewResponseDto,
  ImportResultResponseDto,
  StudentCreatedResponseDto,
  StudentDetailsResponseDto,
  StudentListQueryDto,
  StudentPageResponseDto,
  StudentPasswordResponseDto,
  TransferStudentDto,
  UpdateStudentDto,
} from './students.dto.js';
import { StudentsService } from './students.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });
const idempotencyHeader = ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  description:
    'Ключ формы (8–100 символов): повторная отправка с тем же ключом не создаёт дублей (NFR-006)',
});

@ApiTags('Студенты')
@ApiBearerAuth()
@Controller('students')
@RequirePermissions(Permission.STUDENTS_READ, Permission.STUDENTS_MANAGE)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Список студентов с поиском и фильтрами',
    description: 'Только студенты групп, доступных пользователю (FR-002, FR-007, FR-008).',
  })
  @ApiOkResponse({ type: StudentPageResponseDto })
  list(@Query() query: StudentListQueryDto, @User() user: AuthUser): Promise<StudentPageDto> {
    return this.students.list(user, query);
  }

  @Post()
  @idempotencyHeader
  @ApiOperation({
    summary: 'Добавление студента вручную',
    description: 'Создаёт карточку, учётную запись с временным паролем и запись о группе (FR-006).',
  })
  @ApiCreatedResponse({ type: StudentCreatedResponseDto })
  create(
    @Body() dto: CreateStudentDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<StudentCreatedDto> {
    return this.students.create(user, dto, key);
  }

  @Post('import/preview')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: STUDENT_IMPORT_MAX_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV или XLSX, до 2 МБ' },
      },
    },
  })
  @ApiOperation({
    summary: 'Предпросмотр импорта студентов',
    description: 'Разбирает файл и возвращает строки с ошибками проверки. Ничего не сохраняет.',
  })
  @ApiOkResponse({ type: ImportPreviewResponseDto })
  preview(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @User() user: AuthUser,
  ): Promise<StudentImportPreviewDto> {
    return this.students.previewImport(user, file);
  }

  @Post('import')
  @idempotencyHeader
  @ApiOperation({
    summary: 'Импорт студентов после предпросмотра',
    description: 'Строки проверяются заново; при любой ошибке не создаётся ни одной записи.',
  })
  @ApiCreatedResponse({ type: ImportResultResponseDto })
  import(
    @Body() dto: ImportCommitDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<StudentImportResultDto> {
    return this.students.commitImport(user, dto.rows, key);
  }

  @Get(':id')
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({ summary: 'Карточка студента с историей групп (FR-009, FR-010)' })
  @ApiOkResponse({ type: StudentDetailsResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentDetailsDto> {
    return this.students.get(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменение ФИО студента' })
  @ApiOkResponse({ type: StudentDetailsResponseDto })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: UpdateStudentDto,
    @User() user: AuthUser,
  ): Promise<StudentDetailsDto> {
    return this.students.update(user, id, dto);
  }

  @Post(':id/transfer')
  @HttpCode(200)
  @ApiOperation({ summary: 'Перевод в другую группу без удаления истории (FR-010)' })
  @ApiOkResponse({ type: StudentDetailsResponseDto })
  transfer(
    @Param('id', uuid) id: string,
    @Body() dto: TransferStudentDto,
    @User() user: AuthUser,
  ): Promise<StudentDetailsDto> {
    return this.students.transfer(user, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Архивирование студента (FR-011)',
    description: 'Данные сохраняются, вход в систему закрывается.',
  })
  @ApiOkResponse({ type: StudentDetailsResponseDto })
  archive(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
    @User() user: AuthUser,
  ): Promise<StudentDetailsDto> {
    return this.students.archive(user, id, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Возврат студента из архива' })
  @ApiOkResponse({ type: StudentDetailsResponseDto })
  restore(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentDetailsDto> {
    return this.students.restore(user, id);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Новый временный пароль студента (сессии завершаются)' })
  @ApiOkResponse({ type: StudentPasswordResponseDto })
  resetPassword(
    @Param('id', uuid) id: string,
    @User() user: AuthUser,
  ): Promise<{ login: string; temporaryPassword: string }> {
    return this.students.resetPassword(user, id);
  }
}
