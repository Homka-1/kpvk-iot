import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  type StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  Permission,
  type ResearchAddParticipantsResultDto,
  type ResearchCandidateGroupDto,
  type ResearchDataDto,
  type ResearchParticipantDto,
  type ResearchProjectDetailDto,
  type ResearchProjectDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import { ApiIdempotencyHeader, IdempotencyKey } from '../common/idempotency.service.js';
import { downloadable } from '../common/spreadsheet.js';
import {
  AddParticipantsDto,
  CreateMeasurementDto,
  ResearchAddParticipantsResponseDto,
  ResearchCandidateGroupResponseDto,
  ResearchDataQueryDto,
  ResearchDataResponseDto,
  ResearchExportQueryDto,
  ResearchParticipantResponseDto,
  ResearchProjectDetailResponseDto,
  ResearchProjectInputDto,
  ResearchProjectResponseDto,
  ResearchStatusDto,
} from './research.dto.js';
import { ResearchService } from './research.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Исследования')
@ApiBearerAuth()
@Controller('research-projects')
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get()
  @RequirePermissions(Permission.RESEARCH_READ)
  @ApiOperation({ summary: 'Исследования: статус, период, численность ЭГ и КГ, число замеров' })
  @ApiOkResponse({ type: [ResearchProjectResponseDto] })
  list(): Promise<ResearchProjectDto[]> {
    return this.research.list();
  }

  @Post()
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Создание исследования (п. 4.10)', description: 'Пишется в аудит.' })
  @ApiCreatedResponse({ type: ResearchProjectDetailResponseDto })
  create(
    @Body() dto: ResearchProjectInputDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<ResearchProjectDetailDto> {
    return this.research.create(user, dto, key);
  }

  @Get('candidate-groups')
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiOperation({
    summary: 'Учебные группы для включения в исследование',
    description: 'Только название, курс, специальность и численность — без сведений о студентах.',
  })
  @ApiOkResponse({ type: [ResearchCandidateGroupResponseDto] })
  candidateGroups(): Promise<ResearchCandidateGroupDto[]> {
    return this.research.candidateGroups();
  }

  @Get(':id')
  @RequirePermissions(Permission.RESEARCH_READ)
  @ApiOperation({ summary: 'Исследование и его замеры' })
  @ApiOkResponse({ type: ResearchProjectDetailResponseDto })
  get(@Param('id', uuid) id: string): Promise<ResearchProjectDetailDto> {
    return this.research.get(id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiOperation({ summary: 'Изменение паспорта исследования (подготовка или проведение)' })
  @ApiOkResponse({ type: ResearchProjectDetailResponseDto })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: ResearchProjectInputDto,
  ): Promise<ResearchProjectDetailDto> {
    return this.research.update(id, dto);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiOperation({
    summary: 'Смена статуса исследования',
    description:
      'Подготовка → проводится → завершено → архив (из подготовки — сразу в архив). Недопустимый переход — 409.',
  })
  @ApiOkResponse({ type: ResearchProjectDetailResponseDto })
  changeStatus(
    @Param('id', uuid) id: string,
    @Body() dto: ResearchStatusDto,
  ): Promise<ResearchProjectDetailDto> {
    return this.research.changeStatus(id, dto.status);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiOperation({
    summary: 'Удаление исследования из архива',
    description:
      'Удаляется только исследование в статусе «В архиве» (иначе 409) вместе с участниками и замерами. ' +
      'Ответы диагностики и ИОТ сохраняются; состав удалённого записывается в журнал аудита.',
  })
  @ApiNoContentResponse()
  remove(@Param('id', uuid) id: string): Promise<void> {
    return this.research.remove(id);
  }

  @Get(':id/participants')
  @RequirePermissions(Permission.RESEARCH_READ)
  @ApiOperation({
    summary: 'Участники исследования: коды и группы ЭГ/КГ',
    description:
      'ФИО возвращается только пользователю с разрешением «Просмотр персональных данных участников исследования» (п. 2.4); иначе поле fullName — null.',
  })
  @ApiOkResponse({ type: [ResearchParticipantResponseDto] })
  participants(
    @Param('id', uuid) id: string,
    @User() user: AuthUser,
  ): Promise<ResearchParticipantDto[]> {
    return this.research.participants(user, id);
  }

  @Post(':id/participants')
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiOperation({
    summary: 'Включение студентов учебной группы в экспериментальную или контрольную группу',
    description:
      'Каждый студент получает код участника исследования. Уже участвующие пропускаются, поэтому повторная отправка не создаёт дублей (NFR-006). В контрольную группу не включаются студенты с ИОТ в работе (огр. 4) — 409 с кодами студентов.',
  })
  @ApiCreatedResponse({ type: ResearchAddParticipantsResponseDto })
  addParticipants(
    @Param('id', uuid) id: string,
    @Body() dto: AddParticipantsDto,
  ): Promise<ResearchAddParticipantsResultDto> {
    return this.research.addParticipants(id, dto);
  }

  @Post(':id/participants/:participantId/exclude')
  @HttpCode(200)
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiOperation({
    summary: 'Исключение участника из исследования',
    description:
      'Запись и код сохраняются; участник больше не входит в расчёты. Причина — в аудите.',
  })
  @ApiOkResponse({ type: ResearchParticipantResponseDto })
  exclude(
    @Param('id', uuid) id: string,
    @Param('participantId', uuid) participantId: string,
    @Body() dto: ReasonDto,
    @User() user: AuthUser,
  ): Promise<ResearchParticipantDto> {
    return this.research.excludeParticipant(user, id, participantId, dto.reason);
  }

  @Post(':id/measurements')
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiIdempotencyHeader()
  @ApiOperation({
    summary: 'Фиксация замера: версия методики, тип замера и период (FR-072)',
    description:
      'К замеру относятся завершённые прохождения участников по этой версии и этому типу замера с датой завершения в периоде замера.',
  })
  @ApiCreatedResponse({ type: ResearchProjectDetailResponseDto })
  addMeasurement(
    @Param('id', uuid) id: string,
    @Body() dto: CreateMeasurementDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<ResearchProjectDetailDto> {
    return this.research.addMeasurement(user, id, dto, key);
  }

  @Get(':id/data')
  @RequirePermissions(Permission.RESEARCH_READ)
  @ApiOperation({
    summary: 'Данные исследования по выбранным замерам и шкалам (UC-07; FR-069, FR-070, FR-073)',
    description:
      'Описательные статистики по замерам, шкалам и группам ЭГ/КГ; число полных и неполных наблюдений; изменение между первым и последним замером методики — только для одинаковых или утверждённых сопоставимыми версий (FR-072). Незавершённые прохождения в расчёт не входят, пропуски не заменяются нулями (FR-074). Участники — только коды.',
  })
  @ApiOkResponse({ type: ResearchDataResponseDto })
  data(
    @Param('id', uuid) id: string,
    @Query() query: ResearchDataQueryDto,
  ): Promise<ResearchDataDto> {
    return this.research.data(id, query);
  }

  @Get(':id/export')
  @RequirePermissions(Permission.RESEARCH_EXPORT)
  @ApiOperation({
    summary: 'Обезличенная выгрузка данных исследования (FR-071, FR-075; AT-11)',
    description:
      'CSV (UTF-8, «;») или XLSX. raw — строка на участника: код, группа ЭГ/КГ, полнота наблюдения, по каждому замеру версия методики, дата и баллы шкал; aggregate — описательные статистики и изменения. Без ФИО и учётных данных; пропуск — пустая ячейка. Выгрузка пишется в журнал аудита.',
  })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async export(
    @Param('id', uuid) id: string,
    @Query() query: ResearchExportQueryDto,
  ): Promise<StreamableFile> {
    return downloadable(await this.research.export(id, query));
  }
}
