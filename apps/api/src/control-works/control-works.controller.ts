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
  CONTROL_IMPORT_MAX_BYTES,
  type ControlImportPreviewDto,
  type ControlOptionsDto,
  type ControlSheetDto,
  type ControlWorkDetailDto,
  type ControlWorkListDto,
  Permission,
  type StudentControlResultsDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { IdempotencyKey } from '../common/idempotency.service.js';
import {
  ControlImportPreviewResponseDto,
  ControlOptionsResponseDto,
  ControlResultsInputDto,
  ControlSheetResponseDto,
  ControlWorkDetailResponseDto,
  ControlWorkInputDto,
  ControlWorkListQueryDto,
  ControlWorkListResponseDto,
  StudentControlResultsResponseDto,
} from './control-works.dto.js';
import { ControlWorksService } from './control-works.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Академические достижения')
@ApiBearerAuth()
@Controller('control-works')
export class ControlWorksController {
  constructor(private readonly works: ControlWorksService) {}

  @Get('options')
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({ summary: 'Группы и дисциплины для контрольных работ' })
  @ApiOkResponse({ type: ControlOptionsResponseDto })
  options(@User() user: AuthUser): Promise<ControlOptionsDto> {
    return this.works.options(user);
  }

  @Get()
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Контрольные работы',
    description:
      'Работы доступных групп, сначала последние по дате проведения; по каждой группе — число баллов и средний балл.',
  })
  @ApiOkResponse({ type: ControlWorkListResponseDto })
  list(
    @Query() query: ControlWorkListQueryDto,
    @User() user: AuthUser,
  ): Promise<ControlWorkListDto> {
    return this.works.list(user, query);
  }

  @Post()
  @RequirePermissions(Permission.GRADES_MANAGE)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Ключ формы: повторная отправка не создаёт дублей (NFR-006)',
  })
  @ApiOperation({
    summary: 'Создание контрольной работы',
    description:
      'Одна работа — одна тема, вид контроля и рубрика для всех выбранных групп. Преподаватель выбирает только группы, где ведёт дисциплину. Записывается в журнал аудита.',
  })
  @ApiCreatedResponse({ type: ControlWorkDetailResponseDto })
  create(
    @Body() dto: ControlWorkInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<ControlWorkDetailDto> {
    return this.works.create(user, dto, key);
  }

  @Get(':id')
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Контрольная работа со сравнением групп',
    description:
      'По каждой группе — описательные статистики баллов, число отметок и студентов без данных. Отметки и пропуски в расчёт не входят (FR-074).',
  })
  @ApiOkResponse({ type: ControlWorkDetailResponseDto })
  detail(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<ControlWorkDetailDto> {
    return this.works.detail(user, id);
  }

  @Put(':id')
  @RequirePermissions(Permission.GRADES_MANAGE)
  @ApiOperation({
    summary: 'Изменение контрольной работы',
    description:
      'Группу с результатами убрать нельзя, дисциплину работы с результатами — тоже (409). Записывается в журнал аудита.',
  })
  @ApiOkResponse({ type: ControlWorkDetailResponseDto })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: ControlWorkInputDto,
    @User() user: AuthUser,
  ): Promise<ControlWorkDetailDto> {
    return this.works.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.GRADES_MANAGE)
  @ApiOperation({
    summary: 'Удаление контрольной работы',
    description: 'Удаляется вместе с результатами; число результатов записывается в журнал аудита.',
  })
  @ApiNoContentResponse()
  remove(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<void> {
    return this.works.remove(user, id);
  }

  @Get(':id/groups/:groupId/results')
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Ведомость группы по работе',
    description: 'Все студенты группы (ФИО из базы) и их результаты: балл, отметка или нет данных.',
  })
  @ApiOkResponse({ type: ControlSheetResponseDto })
  sheet(
    @Param('id', uuid) id: string,
    @Param('groupId', uuid) groupId: string,
    @User() user: AuthUser,
  ): Promise<ControlSheetDto> {
    return this.works.sheet(user, id, groupId);
  }

  @Put(':id/groups/:groupId/results')
  @RequirePermissions(Permission.GRADES_MANAGE)
  @ApiOperation({
    summary: 'Сохранение ведомости группы',
    description:
      'Ведомость целиком: балл 0–100 (до 0,1) или отметка «Отсутствовал», «Не выполнил работу», «Освобождён». Без балла и отметки — нет данных, ноль не записывается (FR-074). Записывается в журнал аудита.',
  })
  @ApiOkResponse({ type: ControlSheetResponseDto })
  saveSheet(
    @Param('id', uuid) id: string,
    @Param('groupId', uuid) groupId: string,
    @Body() dto: ControlResultsInputDto,
    @User() user: AuthUser,
  ): Promise<ControlSheetDto> {
    return this.works.saveSheet(user, id, groupId, dto.entries);
  }

  @Post(':id/groups/:groupId/import')
  @HttpCode(200)
  @RequirePermissions(Permission.GRADES_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: CONTROL_IMPORT_MAX_BYTES, files: 1 } }),
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
          description: 'CSV или XLSX до 1 МБ: ФИО | Результат',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Разбор файла результатов для ведомости',
    description:
      'Сопоставляет студентов группы по ФИО и распознаёт балл или отметку. Ничего не сохраняет: ведомость сохраняется отдельно.',
  })
  @ApiOkResponse({ type: ControlImportPreviewResponseDto })
  preview(
    @Param('id', uuid) id: string,
    @Param('groupId', uuid) groupId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @User() user: AuthUser,
  ): Promise<ControlImportPreviewDto> {
    return this.works.previewImport(user, id, groupId, file);
  }
}

@ApiTags('Академические достижения')
@ApiBearerAuth()
@Controller('students/:id/control-results')
export class StudentControlResultsController {
  constructor(private readonly works: ControlWorksService) {}

  @Get()
  @RequirePermissions(Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Результаты контрольных работ студента',
    description:
      'Результаты по дате проведения и по каждой дисциплине — средний балл входного и итогового контроля и их разность.',
  })
  @ApiOkResponse({ type: StudentControlResultsResponseDto })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentControlResultsDto> {
    return this.works.studentResults(user, id);
  }
}

@ApiTags('Кабинет студента')
@ApiBearerAuth()
@Controller('cabinet/control-results')
@RequirePermissions(Permission.CABINET_ACCESS)
export class CabinetControlResultsController {
  constructor(private readonly works: ControlWorksService) {}

  @Get()
  @ApiOperation({ summary: 'Мои результаты контрольных работ' })
  @ApiOkResponse({ type: StudentControlResultsResponseDto })
  get(@User() user: AuthUser): Promise<StudentControlResultsDto> {
    return this.works.cabinetResults(user);
  }
}
