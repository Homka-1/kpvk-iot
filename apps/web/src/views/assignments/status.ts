import {
  ASSESSMENT_DECISION_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  type AssessmentDecision,
  type AssignmentResultDto,
  type AssignmentStatus,
  DIFFICULTY_LEVEL_LABELS,
  isAssignmentOverdue,
  type StudentAssignmentDto,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';
import { formatDate, formatNumber } from '@/utils/format';

const TONES: Record<AssignmentStatus, StatusTone> = {
  OFFERED: 'info',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  SUBMITTED: 'warning',
  RETURNED: 'warning',
  COMPLETED: 'success',
  DECLINED: 'neutral',
  CANCELLED: 'neutral',
};

const ICONS: Record<AssignmentStatus, string> = {
  OFFERED: 'pi pi-list',
  ASSIGNED: 'pi pi-file-edit',
  IN_PROGRESS: 'pi pi-spinner',
  SUBMITTED: 'pi pi-send',
  RETURNED: 'pi pi-replay',
  COMPLETED: 'pi pi-check-circle',
  DECLINED: 'pi pi-minus-circle',
  CANCELLED: 'pi pi-ban',
};

/** Статус задания: цвет, текст и значок (п. 6.1 — не только цвет). */
export function assignmentBadge(status: AssignmentStatus): {
  label: string;
  tone: StatusTone;
  icon: string;
} {
  return { label: ASSIGNMENT_STATUS_LABELS[status], tone: TONES[status], icon: ICONS[status] };
}

/** Срок сдачи для людей: «до 20.09.2026» или «срок не задан». */
export function dueText(dueAt: string | null): string {
  return dueAt ? `до ${formatDate(new Date(dueAt))}` : 'срок не задан';
}

/** Краткое описание задания: тип, сложность, этап ИОТ или «вне маршрута». */
export function assignmentMeta(item: StudentAssignmentDto): string {
  const parts = [
    item.assignment.typeName,
    `сложность: ${DIFFICULTY_LEVEL_LABELS[item.assignment.difficulty].toLowerCase()}`,
  ];
  const stage = item.trajectory?.stage;
  if (stage) parts.push(`этап ${stage.sortOrder + 1} «${stage.title}»`);
  return parts.join(' · ');
}

/** Бейдж просрочки (FR-053) или null, если срок не нарушен. */
export function overdueBadge(item: {
  status: AssignmentStatus;
  dueAt: string | null;
}): { label: string; tone: StatusTone; icon: string } | null {
  return isAssignmentOverdue(item)
    ? { label: 'Просрочено', tone: 'danger', icon: 'pi pi-exclamation-triangle' }
    : null;
}

/** Решение преподавателя по попытке: цвет, текст и значок. */
export function decisionBadge(decision: AssessmentDecision): {
  label: string;
  tone: StatusTone;
  icon: string;
} {
  return decision === 'ACCEPTED'
    ? { label: ASSESSMENT_DECISION_LABELS.ACCEPTED, tone: 'success', icon: 'pi pi-check-circle' }
    : { label: ASSESSMENT_DECISION_LABELS.RETURNED, tone: 'warning', icon: 'pi pi-replay' };
}

/** Балл «7 из 7,5»; без балла — null (оценка по критериям не ставилась). */
export function scoreText(result: Pick<AssignmentResultDto, 'score' | 'maxScore'>): string | null {
  if (result.score === null) return null;
  return result.maxScore === null
    ? formatNumber(result.score)
    : `${formatNumber(result.score)} из ${formatNumber(result.maxScore)}`;
}
