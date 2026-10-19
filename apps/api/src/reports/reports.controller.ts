import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Permission } from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReportQueryDto } from './reports.dto.js';
import { type ReportFile, ReportsService } from './reports.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });
const FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function attachment(file: ReportFile): StreamableFile {
  return new StreamableFile(file.content, {
    type: file.contentType,
    disposition: `attachment; filename="${file.fileName}"`,
    length: file.content.length,
  });
}

const COMMON =
  'Отчёт содержит дату формирования, период, показатели и автора. Данные — только по студентам области пользователя (FR-002); служебные заметки преподавателя и ответы диагностики в отчёт не входят. Нет данных — «Нет данных», не ноль. Формирование записывается в журнал аудита.';

@ApiTags('Отчёты')
@ApiBearerAuth()
@Controller('reports')
@RequirePermissions(Permission.REPORTS_READ, Permission.STUDENTS_READ)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('students/:id')
  @ApiOperation({
    summary: 'Индивидуальный отчёт студента (FR-076, FR-080)',
    description: `PDF или XLSX: общие сведения, мотивационный профиль, ИОТ и их выполнение, результаты диагностики. ${COMMON}`,
  })
  @ApiProduces(...FILE_TYPES)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async student(
    @Param('id', uuid) id: string,
    @Query() query: ReportQueryDto,
    @User() user: AuthUser,
  ): Promise<StreamableFile> {
    return attachment(await this.reports.studentReport(user, id, query));
  }

  @Get('group')
  @ApiOperation({
    summary: 'Отчёт по группе (FR-077, FR-080)',
    description: `PDF или XLSX: состав, распределение профилей, выполнение ИОТ, статистики группы. Нужен параметр groupId. ${COMMON}`,
  })
  @ApiProduces(...FILE_TYPES)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async group(@Query() query: ReportQueryDto, @User() user: AuthUser): Promise<StreamableFile> {
    return attachment(await this.reports.groupReport(user, query));
  }

  @Get('trajectories')
  @ApiOperation({
    summary: 'Отчёт по реализации ИОТ (FR-078, FR-080)',
    description: `PDF или XLSX: сводка, прогресс по маршрутам, предупреждения о просрочках. ${COMMON}`,
  })
  @ApiProduces(...FILE_TYPES)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async trajectories(
    @Query() query: ReportQueryDto,
    @User() user: AuthUser,
  ): Promise<StreamableFile> {
    return attachment(await this.reports.trajectoriesReport(user, query));
  }

  @Get('diagnostics')
  @ApiOperation({
    summary: 'Отчёт по диагностике (FR-079, FR-080)',
    description: `PDF или XLSX: завершённые и незавершённые прохождения, статистики шкал по замерам, изменение до и после сопровождения. Методика — параметр versionId. ${COMMON}`,
  })
  @ApiProduces(...FILE_TYPES)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async diagnostics(
    @Query() query: ReportQueryDto,
    @User() user: AuthUser,
  ): Promise<StreamableFile> {
    return attachment(await this.reports.diagnosticsReport(user, query));
  }
}
