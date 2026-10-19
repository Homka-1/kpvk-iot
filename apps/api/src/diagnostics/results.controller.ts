import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
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
  type ComparabilityQuestionnaireDto,
  type DiagnosticComparisonDto,
  Permission,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import { downloadable } from '../common/spreadsheet.js';
import {
  ApproveComparabilityDto,
  ComparabilityQuestionnaireResponseDto,
  DiagnosticComparisonResponseDto,
  ExportResultsQueryDto,
} from './results.dto.js';
import { DiagnosticResultsService } from './results.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Диагностика: сравнение замеров')
@ApiBearerAuth()
@Controller('students/:id/diagnostics/comparison')
@RequirePermissions(Permission.STUDENTS_READ)
export class StudentDiagnosticComparisonController {
  constructor(private readonly results: DiagnosticResultsService) {}

  @Get()
  @ApiOperation({
    summary: 'Сравнение замеров студента и динамика по шкалам (FR-015, FR-024; UC-06)',
    description:
      'По каждой методике: базовый (первичный) замер и замеры той же или сопоставимой версии, изменение по шкалам. Пропуски — null, а не ноль (FR-074). Замеры несопоставимых версий перечисляются отдельно с причиной.',
  })
  @ApiOkResponse({ type: [DiagnosticComparisonResponseDto] })
  get(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<DiagnosticComparisonDto[]> {
    return this.results.comparisonForStudent(user, id);
  }
}

@ApiTags('Диагностика: сравнение замеров')
@ApiBearerAuth()
@Controller('questionnaire-comparabilities')
export class ComparabilitiesController {
  constructor(private readonly results: DiagnosticResultsService) {}

  @Get()
  @RequirePermissions(Permission.RESEARCH_READ)
  @ApiOperation({
    summary: 'Методики, их опубликованные версии и утверждённая сопоставимость версий',
    description: 'Без персональных данных студентов. Используется для выбора методики выгрузки.',
  })
  @ApiOkResponse({ type: [ComparabilityQuestionnaireResponseDto] })
  list(): Promise<ComparabilityQuestionnaireDto[]> {
    return this.results.listComparabilities();
  }

  @Post()
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiOperation({
    summary: 'Утверждение сопоставимости двух версий методики (UC-06)',
    description:
      'Замеры сопоставимых версий сравниваются между собой по шкалам с одинаковым кодом. Повторное утверждение той же пары отклоняется (409).',
  })
  @ApiCreatedResponse({ type: ComparabilityQuestionnaireResponseDto })
  approve(
    @Body() dto: ApproveComparabilityDto,
    @User() user: AuthUser,
  ): Promise<ComparabilityQuestionnaireDto> {
    return this.results.approveComparability(user, dto);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermissions(Permission.RESEARCH_MANAGE)
  @ApiOperation({
    summary: 'Отзыв сопоставимости версий',
    description: 'Причина сохраняется в журнале аудита. Результаты прохождений не изменяются.',
  })
  @ApiOkResponse({ type: ComparabilityQuestionnaireResponseDto })
  revoke(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
  ): Promise<ComparabilityQuestionnaireDto> {
    return this.results.revokeComparability(id, dto.reason);
  }
}

@ApiTags('Диагностика: сравнение замеров')
@ApiBearerAuth()
@Controller('diagnostic-results')
export class DiagnosticResultsExportController {
  constructor(private readonly results: DiagnosticResultsService) {}

  @Get('export')
  @RequirePermissions(Permission.RESEARCH_EXPORT)
  @ApiOperation({
    summary: 'Обезличенная выгрузка результатов диагностики (FR-025)',
    description:
      'CSV (UTF-8, разделитель «;») или XLSX. Строка — завершённое прохождение: код участника вместо ФИО, группа, версия методики, тип замера, баллы, уровни и число пропусков по шкалам. Нет балла — пустая ячейка, не ноль (FR-074). Выгрузка записывается в журнал аудита.',
  })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async export(@Query() query: ExportResultsQueryDto): Promise<StreamableFile> {
    return downloadable(await this.results.exportResults(query));
  }
}
