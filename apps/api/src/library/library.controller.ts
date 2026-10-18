import {
  Body,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  type CallHandler,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AssignmentTypeDto,
  FILE_UPLOAD_HINT,
  FILE_UPLOAD_MAX_BYTES,
  type FileDto,
  formatFileSize,
  type LibraryAssignmentDto,
  type MaterialDto,
  Permission,
} from '@iot/shared';
import type { Observable } from 'rxjs';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import {
  ApiIdempotencyHeader,
  IdempotencyKey,
  IdempotencyService,
} from '../common/idempotency.service.js';
import { LibraryAssignmentsService } from './assignments.service.js';
import { FilesService, type StoredFileContent, type UploadedFileInput } from './files.service.js';
import {
  AssignmentTypeInputDto,
  AssignmentTypeResponseDto,
  FileResponseDto,
  LibraryAssignmentInputDto,
  LibraryAssignmentListQueryDto,
  LibraryAssignmentResponseDto,
  MaterialInputDto,
  MaterialListQueryDto,
  MaterialResponseDto,
} from './library.dto.js';
import { MaterialsService } from './materials.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

/**
 * Приём одного файла в память с лимитом размера. Имена файлов читаются как UTF-8 (кириллица),
 * превышение лимита — понятная ошибка 413 вместо сообщения multer.
 */
@Injectable()
class SingleFileInterceptor extends FileInterceptor('file', {
  limits: { fileSize: FILE_UPLOAD_MAX_BYTES, files: 1 },
  defParamCharset: 'utf8',
} as Parameters<typeof FileInterceptor>[1]) {
  override async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException(
          `Файл больше ${formatFileSize(FILE_UPLOAD_MAX_BYTES)}. Уменьшите размер файла`,
        );
      }
      throw error;
    }
  }
}

@ApiTags('Библиотека')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @RequirePermissions(Permission.LIBRARY_MANAGE)
  @UseInterceptors(SingleFileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: FILE_UPLOAD_HINT } },
    },
  })
  @ApiOperation({
    summary: 'Загрузка файла для библиотеки (FR-049)',
    description:
      'Проверяются расширение (белый список), размер и соответствие содержимого формату. Файл хранится под случайным именем; затем его id указывается в материале или задании.',
  })
  @ApiCreatedResponse({ type: FileResponseDto })
  upload(
    @UploadedFile() file: UploadedFileInput | undefined,
    @User() user: AuthUser,
  ): Promise<FileDto> {
    return this.files.upload(file, user.id);
  }

  @Get(':id')
  @RequirePermissions(Permission.LIBRARY_MANAGE)
  @ApiOperation({
    summary: 'Скачивание файла',
    description:
      'Доступно загрузившему и тем, кому видна запись библиотеки с этим файлом. Всегда отдаётся как вложение.',
  })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StreamableFile> {
    return attachment(await this.files.read(user, id));
  }
}

@ApiTags('Кабинет студента')
@ApiBearerAuth()
@Controller('cabinet/files')
@RequirePermissions(Permission.CABINET_ACCESS)
export class CabinetFilesController {
  constructor(private readonly files: FilesService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Скачивание файла материала или задания студентом',
    description:
      'Только материалы этапов своей утверждённой ИОТ и вложения назначенных студенту заданий (AT-12). Остальные файлы — 404.',
  })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StreamableFile> {
    return attachment(await this.files.readForStudent(user, id));
  }
}

/** Файл всегда отдаётся как вложение: браузер не исполняет содержимое на странице приложения. */
function attachment({ file, content }: StoredFileContent): StreamableFile {
  const ascii = file.originalName.replace(/[^\x20-\x7e]/g, '_');
  return new StreamableFile(content, {
    type: file.mimeType,
    length: content.length,
    disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  });
}

@ApiTags('Библиотека')
@ApiBearerAuth()
@Controller('materials')
@RequirePermissions(Permission.LIBRARY_MANAGE)
export class MaterialsController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Библиотека материалов с поиском',
    description: 'Материалы своих дисциплин и общие материалы без дисциплины (FR-002).',
  })
  @ApiOkResponse({ type: [MaterialResponseDto] })
  list(@Query() query: MaterialListQueryDto, @User() user: AuthUser): Promise<MaterialDto[]> {
    return this.materials.list(user, query);
  }

  @Post()
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Новый материал: файл, ссылка или текст' })
  @ApiCreatedResponse({ type: MaterialResponseDto })
  async create(
    @Body() dto: MaterialInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<MaterialDto> {
    return (await this.idempotency.run(user.id, key, dto, () => this.materials.create(user, dto)))
      .response;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Материал' })
  @ApiOkResponse({ type: MaterialResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<MaterialDto> {
    return this.materials.get(user, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Изменение материала' })
  @ApiOkResponse({ type: MaterialResponseDto })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: MaterialInputDto,
    @User() user: AuthUser,
  ): Promise<MaterialDto> {
    return this.materials.update(user, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Архивирование материала (из ИОТ он не удаляется)' })
  @ApiOkResponse({ type: MaterialResponseDto })
  archive(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
    @User() user: AuthUser,
  ): Promise<MaterialDto> {
    return this.materials.setArchived(user, id, true, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Возврат материала из архива' })
  @ApiOkResponse({ type: MaterialResponseDto })
  restore(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<MaterialDto> {
    return this.materials.setArchived(user, id, false);
  }
}

@ApiTags('Библиотека')
@ApiBearerAuth()
@Controller('assignment-types')
@RequirePermissions(Permission.LIBRARY_MANAGE)
export class AssignmentTypesController {
  constructor(
    private readonly assignments: LibraryAssignmentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Типы заданий: стандартные (п. 4.7) и добавленные' })
  @ApiOkResponse({ type: [AssignmentTypeResponseDto] })
  list(): Promise<AssignmentTypeDto[]> {
    return this.assignments.listTypes();
  }

  @Post()
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Новый тип задания' })
  @ApiCreatedResponse({ type: AssignmentTypeResponseDto })
  async create(
    @Body() dto: AssignmentTypeInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<AssignmentTypeDto> {
    return (await this.idempotency.run(user.id, key, dto, () => this.assignments.createType(dto)))
      .response;
  }
}

@ApiTags('Библиотека')
@ApiBearerAuth()
@Controller('library-assignments')
@RequirePermissions(Permission.LIBRARY_MANAGE)
export class LibraryAssignmentsController {
  constructor(
    private readonly assignments: LibraryAssignmentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Библиотека заданий с поиском (FR-047)',
    description:
      'Поиск по дисциплине, теме, уровню сложности и типу; только свои дисциплины (FR-002).',
  })
  @ApiOkResponse({ type: [LibraryAssignmentResponseDto] })
  list(
    @Query() query: LibraryAssignmentListQueryDto,
    @User() user: AuthUser,
  ): Promise<LibraryAssignmentDto[]> {
    return this.assignments.list(user, query);
  }

  @Post()
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Создание задания (FR-046, FR-049)' })
  @ApiCreatedResponse({ type: LibraryAssignmentResponseDto })
  async create(
    @Body() dto: LibraryAssignmentInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<LibraryAssignmentDto> {
    return (await this.idempotency.run(user.id, key, dto, () => this.assignments.create(user, dto)))
      .response;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Задание библиотеки' })
  @ApiOkResponse({ type: LibraryAssignmentResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<LibraryAssignmentDto> {
    return this.assignments.get(user, id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Изменение задания (FR-046)',
    description: 'Критерии, по которым уже выставлены оценки, изменить нельзя (409).',
  })
  @ApiOkResponse({ type: LibraryAssignmentResponseDto })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: LibraryAssignmentInputDto,
    @User() user: AuthUser,
  ): Promise<LibraryAssignmentDto> {
    return this.assignments.update(user, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Архивирование задания (назначенные ранее не затрагиваются)' })
  @ApiOkResponse({ type: LibraryAssignmentResponseDto })
  archive(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
    @User() user: AuthUser,
  ): Promise<LibraryAssignmentDto> {
    return this.assignments.setArchived(user, id, true, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Возврат задания из архива' })
  @ApiOkResponse({ type: LibraryAssignmentResponseDto })
  restore(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<LibraryAssignmentDto> {
    return this.assignments.setArchived(user, id, false);
  }
}
