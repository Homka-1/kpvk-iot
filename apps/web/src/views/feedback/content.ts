import {
  CONSULTATION_STATUS_LABELS,
  type ConsultationStatus,
  FEEDBACK_KIND_LABELS,
  type FeedbackBindingDto,
  type FeedbackDto,
  FeedbackKind,
  RESOLVABLE_FEEDBACK_KINDS,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';

/** Студент в списке выбора диалогов. */
export interface StudentOption {
  id: string;
  label: string;
}

export interface Badge {
  label: string;
  tone: StatusTone;
  icon: string;
}

const KIND_ICONS: Record<FeedbackKind, string> = {
  RECOMMENDATION: 'pi pi-lightbulb',
  COMMENT: 'pi pi-comment',
  SHORT_TERM_GOAL: 'pi pi-flag',
  SELF_ASSESSMENT_REQUEST: 'pi pi-star',
  QUESTION: 'pi pi-question-circle',
  DIFFICULTY_REPORT: 'pi pi-exclamation-triangle',
  ROUTE_CHANGE_PROPOSAL: 'pi pi-directions',
};

/** Вид сообщения: текст и иконка, цвет сдержанный (статус не только цветом, п. 6.1). */
export function kindBadge(kind: FeedbackKind): Badge {
  return {
    label: FEEDBACK_KIND_LABELS[kind],
    tone: kind === FeedbackKind.DIFFICULTY_REPORT ? 'warning' : 'info',
    icon: KIND_ICONS[kind],
  };
}

export const INTERNAL_BADGE: Badge = {
  label: 'Видно только преподавателям',
  tone: 'neutral',
  icon: 'pi pi-lock',
};

/** Состояние обращения студента: ждёт ответа или рассмотрено. Для остальных — null. */
export function resolutionBadge(item: FeedbackDto): Badge | null {
  if (item.kind === FeedbackKind.SELF_ASSESSMENT_REQUEST) {
    return item.resolvedAt
      ? { label: 'Самооценка получена', tone: 'success', icon: 'pi pi-check-circle' }
      : { label: 'Ждёт самооценки', tone: 'warning', icon: 'pi pi-clock' };
  }
  if (!RESOLVABLE_FEEDBACK_KINDS.includes(item.kind)) return null;
  return item.resolvedAt
    ? { label: 'Рассмотрено', tone: 'success', icon: 'pi pi-check-circle' }
    : { label: 'Ждёт ответа', tone: 'warning', icon: 'pi pi-clock' };
}

const CONSULTATION_TONES: Record<ConsultationStatus, Badge> = {
  REQUESTED: { label: CONSULTATION_STATUS_LABELS.REQUESTED, tone: 'warning', icon: 'pi pi-clock' },
  SCHEDULED: { label: CONSULTATION_STATUS_LABELS.SCHEDULED, tone: 'info', icon: 'pi pi-calendar' },
  HELD: { label: CONSULTATION_STATUS_LABELS.HELD, tone: 'success', icon: 'pi pi-check-circle' },
  CANCELLED: {
    label: CONSULTATION_STATUS_LABELS.CANCELLED,
    tone: 'neutral',
    icon: 'pi pi-times-circle',
  },
};

export const consultationBadge = (status: ConsultationStatus): Badge => CONSULTATION_TONES[status];

/** Привязка записи (FR-064) одной строкой; без привязки — «Студент в целом». */
export function bindingText(item: FeedbackBindingDto): string {
  const parts: string[] = [];
  if (item.trajectory) parts.push(`ИОТ: ${item.trajectory.disciplineName}`);
  if (item.stage) parts.push(`этап ${item.stage.sortOrder + 1}. ${item.stage.title}`);
  if (item.assignment) parts.push(`задание «${item.assignment.title}»`);
  return parts.length > 0 ? parts.join(' · ') : 'Студент в целом';
}

/** Дата и время из полей формы (дд/мм/гггг в DateInput и чч:мм) в ISO по местному времени. */
export function toIsoDateTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/** Местные дата (YYYY-MM-DD) и время (чч:мм) для полей формы. */
export function splitDateTime(value: Date): { date: string; time: string } {
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export const SELF_ASSESSMENT_HINT = '1 — совсем не получилось, 5 — всё получилось';
