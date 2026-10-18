import {
  MEASUREMENT_TYPE_LABELS,
  type MonitoringRowDto,
  type MonitoringWarningDto,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';

export function warningBadge(warning: MonitoringWarningDto): {
  label: string;
  tone: StatusTone;
  icon: string;
} {
  return warning.kind === 'OVERDUE_ASSIGNMENT'
    ? { label: 'Просрочено задание', tone: 'danger', icon: 'pi pi-clock' }
    : { label: 'Пропущена контрольная точка', tone: 'warning', icon: 'pi pi-flag' };
}

/** Срок предупреждения: у задания — дата и время, у контрольной точки — дата. */
export function warningDue(warning: MonitoringWarningDto): string {
  return warning.kind === 'OVERDUE_ASSIGNMENT'
    ? formatDateTime(warning.dueAt)
    : formatDate(warning.dueAt);
}

export const percentText = (value: number | null) =>
  value === null ? 'Нет данных' : `${formatNumber(value)} %`;

/** Показатели строки мониторинга (п. 4.8) текстом: пропуски — «Нет данных», а не ноль. */
export function rowFacts(row: MonitoringRowDto): { label: string; value: string }[] {
  const { progress, checkpoints, diagnostics } = row;
  return [
    {
      label: 'Задания',
      value: progress.total
        ? `выполнено ${progress.completed} из ${progress.total}` +
          (progress.overdue ? `, просрочено ${progress.overdue}` : '')
        : 'Нет данных: заданий нет',
    },
    {
      label: 'Этапы (цели маршрута)',
      value: `завершено ${row.stages.completed} из ${row.stages.total}`,
    },
    {
      label: 'Контрольные точки',
      value: checkpoints.total
        ? `пройдено ${checkpoints.passed} из ${checkpoints.total}` +
          (checkpoints.missed ? `, пропущено ${checkpoints.missed}` : '')
        : 'Нет данных: точки не заданы',
    },
    {
      label: 'Средний результат',
      value: row.scoredCount
        ? `${percentText(row.averageScore)} (оценок: ${row.scoredCount})`
        : 'Нет данных: оценок нет',
    },
    {
      label: 'Учебная активность',
      value: row.activity.submissions
        ? `ответов: ${row.activity.submissions}, последний ${formatDate(row.activity.lastSubmissionAt)}`
        : 'Ответы не отправлялись',
    },
    { label: 'Обращения за помощью', value: String(row.helpRequests) },
    { label: 'Корректировки маршрута', value: String(row.corrections) },
    {
      label: 'Диагностика',
      value:
        diagnostics.completed && diagnostics.lastMeasurementType
          ? `замеров: ${diagnostics.completed}, последний — ${MEASUREMENT_TYPE_LABELS[
              diagnostics.lastMeasurementType
            ].toLowerCase()}, ${formatDate(diagnostics.lastCompletedAt)}`
          : 'Нет данных',
    },
  ];
}
