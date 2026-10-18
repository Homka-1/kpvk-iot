import {
  ASSIGNMENT_STATUS_LABELS,
  type AssignmentStatus,
  DIFFICULTY_LEVEL_LABELS,
  type StudentAssignmentDto,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';

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
