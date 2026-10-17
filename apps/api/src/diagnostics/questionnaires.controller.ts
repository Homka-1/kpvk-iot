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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type DiagnosticDirectionDto,
  Permission,
  type QuestionnaireDetailDto,
  type QuestionnaireSummaryDto,
  type QuestionnaireVersionDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import { IdempotencyKey, IdempotencyService } from '../common/idempotency.service.js';
import {
  CreateQuestionnaireDto,
  CreateVersionDto,
  DirectionInputDto,
  DirectionResponseDto,
  QuestionnaireContentDto,
  QuestionnaireDetailResponseDto,
  QuestionnaireListQueryDto,
  QuestionnaireSummaryResponseDto,
  QuestionnaireVersionResponseDto,
  UpdateQuestionnaireDto,
} from './questionnaires.dto.js';
import { QuestionnairesService } from './questionnaires.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: true,
  description: 'Ключ повторной отправки формы (NFR-006): повтор с тем же ключом не создаёт дубль',
};

@ApiTags('Диагностика: методики')
@ApiBearerAuth()
@Controller('diagnostic-directions')
@RequirePermissions(Permission.DIAGNOSTICS_MANAGE)
export class DiagnosticDirectionsController {
  constructor(private readonly questionnaires: QuestionnairesService) {}

  @Get()
  @ApiOperation({ summary: 'Диагностические направления (настраиваемые разделы п. 4.4 ТЗ)' })
  @ApiOkResponse({ type: [DirectionResponseDto] })
  list(): Promise<DiagnosticDirectionDto[]> {
    return this.questionnaires.listDirections();
  }

  @Post()
  @ApiOperation({ summary: 'Новое диагностическое направление' })
  @ApiCreatedResponse({ type: DirectionResponseDto })
  create(@Body() dto: DirectionInputDto): Promise<DiagnosticDirectionDto> {
    return this.questionnaires.createDirection(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменение диагностического направления' })
  @ApiOkResponse({ type: DirectionResponseDto })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: DirectionInputDto,
  ): Promise<DiagnosticDirectionDto> {
    return this.questionnaires.updateDirection(id, dto);
  }
}

@ApiTags('Диагностика: методики')
@ApiBearerAuth()
@Controller('questionnaires')
@RequirePermissions(Permission.DIAGNOSTICS_MANAGE)
export class QuestionnairesController {
  constructor(
    private readonly questionnaires: QuestionnairesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Список методик',
    description: 'Название последней версии, действующая версия и черновик (FR-017).',
  })
  @ApiOkResponse({ type: [QuestionnaireSummaryResponseDto] })
  list(@Query() query: QuestionnaireListQueryDto): Promise<QuestionnaireSummaryDto[]> {
    return this.questionnaires.list(query.includeArchived);
  }

  @Post()
  @ApiOperation({
    summary: 'Создание методики',
    description: 'Создаёт методику и её первую версию в статусе «Черновик» (FR-017).',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: QuestionnaireDetailResponseDto })
  async create(
    @Body() dto: CreateQuestionnaireDto,
    @User() actor: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<QuestionnaireDetailDto> {
    const result = await this.idempotency.run(actor.id, key, dto, () =>
      this.questionnaires.create(dto, actor.id),
    );
    return result.response;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Методика и список её версий' })
  @ApiOkResponse({ type: QuestionnaireDetailResponseDto })
  get(@Param('id', uuid) id: string): Promise<QuestionnaireDetailDto> {
    return this.questionnaires.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Смена диагностического направления методики' })
  @ApiOkResponse({ type: QuestionnaireDetailResponseDto })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: UpdateQuestionnaireDto,
  ): Promise<QuestionnaireDetailDto> {
    return this.questionnaires.updateDirectionOf(id, dto.directionId);
  }

  @Post(':id/copy')
  @ApiOperation({
    summary: 'Копирование методики (FR-017)',
    description:
      'Новая методика с черновиком версии 1 из последней версии источника. Копия демо-методики остаётся демо.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: QuestionnaireDetailResponseDto })
  async copy(
    @Param('id', uuid) id: string,
    @User() actor: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<QuestionnaireDetailDto> {
    const result = await this.idempotency.run(actor.id, key, { copyOf: id }, () =>
      this.questionnaires.copy(id, actor.id),
    );
    return result.response;
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Архивирование методики (FR-017); версии и результаты сохраняются' })
  @ApiOkResponse({ type: QuestionnaireDetailResponseDto })
  archive(@Param('id', uuid) id: string, @Body() dto: ReasonDto): Promise<QuestionnaireDetailDto> {
    return this.questionnaires.archive(id, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Возврат методики из архива' })
  @ApiOkResponse({ type: QuestionnaireDetailResponseDto })
  restore(@Param('id', uuid) id: string): Promise<QuestionnaireDetailDto> {
    return this.questionnaires.restore(id);
  }

  @Post(':id/versions')
  @ApiOperation({
    summary: 'Новая версия методики (FR-026)',
    description:
      'Черновик — копия действующей версии. Прежние версии и результаты прохождений не изменяются и не пересчитываются.',
  })
  @ApiCreatedResponse({ type: QuestionnaireVersionResponseDto })
  createVersion(
    @Param('id', uuid) id: string,
    @Body() dto: CreateVersionDto,
    @User() actor: AuthUser,
  ): Promise<QuestionnaireVersionDto> {
    return this.questionnaires.createVersion(id, dto.changeNote ?? null, actor.id);
  }

  @Get(':id/versions/:versionId')
  @ApiOperation({ summary: 'Версия методики со всем содержимым: паспорт, вопросы, шкалы, ключи' })
  @ApiOkResponse({ type: QuestionnaireVersionResponseDto })
  getVersion(
    @Param('id', uuid) id: string,
    @Param('versionId', uuid) versionId: string,
  ): Promise<QuestionnaireVersionDto> {
    return this.questionnaires.getVersion(id, versionId);
  }

  @Put(':id/versions/:versionId')
  @ApiOperation({
    summary: 'Сохранение черновика версии',
    description:
      'Полностью заменяет паспорт, вопросы, шкалы, ключи и правила интерпретации. Опубликованная версия — 409.',
  })
  @ApiOkResponse({ type: QuestionnaireVersionResponseDto })
  saveDraft(
    @Param('id', uuid) id: string,
    @Param('versionId', uuid) versionId: string,
    @Body() dto: QuestionnaireContentDto,
  ): Promise<QuestionnaireVersionDto> {
    return this.questionnaires.saveDraft(id, versionId, dto);
  }

  @Delete(':id/versions/:versionId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Удаление черновика новой версии (первую версию удалить нельзя)' })
  @ApiNoContentResponse()
  deleteDraft(
    @Param('id', uuid) id: string,
    @Param('versionId', uuid) versionId: string,
  ): Promise<void> {
    return this.questionnaires.deleteDraft(id, versionId);
  }

  @Post(':id/versions/:versionId/publish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Публикация версии',
    description:
      'Полная проверка содержимого; при замечаниях — 400 с полями. Предыдущая опубликованная версия выводится из использования. Опубликованная версия неизменяема (FR-026).',
  })
  @ApiOkResponse({ type: QuestionnaireVersionResponseDto })
  publish(
    @Param('id', uuid) id: string,
    @Param('versionId', uuid) versionId: string,
    @User() actor: AuthUser,
  ): Promise<QuestionnaireVersionDto> {
    return this.questionnaires.publish(id, versionId, actor.id);
  }
}
