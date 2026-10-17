import {
  type AnswerValue,
  ASSIGNMENT_STATE_LABELS,
  type AssignmentState,
  DIAGNOSTIC_SESSION_STATUS_LABELS,
  type DiagnosticSessionStatus,
  type FormQuestion,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';

interface Badge {
  label: string;
  tone: StatusTone;
  icon: string;
}

const SESSION_BADGES: Record<DiagnosticSessionStatus, Omit<Badge, 'label'>> = {
  ASSIGNED: { tone: 'info', icon: 'pi pi-clock' },
  IN_PROGRESS: { tone: 'warning', icon: 'pi pi-pencil' },
  COMPLETED: { tone: 'success', icon: 'pi pi-check-circle' },
  EXPIRED: { tone: 'danger', icon: 'pi pi-calendar-times' },
  CANCELLED: { tone: 'neutral', icon: 'pi pi-ban' },
};

const ASSIGNMENT_BADGES: Record<AssignmentState, Omit<Badge, 'label'>> = {
  PLANNED: { tone: 'info', icon: 'pi pi-calendar' },
  ACTIVE: { tone: 'success', icon: 'pi pi-play-circle' },
  FINISHED: { tone: 'neutral', icon: 'pi pi-flag' },
  CANCELLED: { tone: 'neutral', icon: 'pi pi-ban' },
};

/** Статус прохождения: цвет, текст и иконка (п. 6.1). */
export function sessionBadge(status: DiagnosticSessionStatus): Badge {
  return { label: DIAGNOSTIC_SESSION_STATUS_LABELS[status], ...SESSION_BADGES[status] };
}

export function assignmentBadge(state: AssignmentState): Badge {
  return { label: ASSIGNMENT_STATE_LABELS[state], ...ASSIGNMENT_BADGES[state] };
}

/** Период назначения. Конец периода не включительно, поэтому показывается предыдущий день. */
export function periodText(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt || !endsAt) return 'Без срока';
  const lastDay = new Date(new Date(endsAt).getTime() - 1);
  return `${formatDate(startsAt)} — ${formatDate(lastDay)}`;
}

/** Время прохождения «12 мин 5 с»; пусто — «Нет данных» (например, бумажный бланк). */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'Нет данных';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} с`;
  return rest === 0 ? `${minutes} мин` : `${minutes} мин ${rest} с`;
}

/** Ответ на вопрос в читаемом виде: тексты выбранных вариантов, число или текст. */
export function formatAnswer(question: FormQuestion, value: AnswerValue | undefined): string {
  if (value === null || value === undefined) return 'Нет ответа';
  const optionText = (key: string) =>
    question.options.find((option) => option.key === key)?.text ?? 'Неизвестный вариант';
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(optionText).join('; ') : 'Ничего не выбрано';
  }
  if (typeof value === 'number') return value.toLocaleString('ru-RU');
  return question.type === 'SINGLE_CHOICE' ? optionText(value) : value;
}
