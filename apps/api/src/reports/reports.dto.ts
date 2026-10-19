import { ApiProperty } from '@nestjs/swagger';
import { ReportFormat } from '@iot/shared';
import { IsIn } from 'class-validator';
import { AnalyticsQueryDto } from '../analytics/analytics.dto.js';

/**
 * Параметры отчёта: контекст шапки (группа, дисциплина, период), версия методики для отчёта
 * по диагностике и формат файла. Студент и группа индивидуального и группового отчётов —
 * в пути и в `groupId`.
 */
export class ReportQueryDto extends AnalyticsQueryDto {
  @ApiProperty({ enum: Object.values(ReportFormat), description: 'PDF или XLSX (FR-080)' })
  @IsIn(Object.values(ReportFormat), { message: 'Выберите формат: PDF или XLSX' })
  format: ReportFormat;
}
