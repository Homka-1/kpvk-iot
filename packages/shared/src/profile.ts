// Профиль студента и педагогические наблюдения (ТЗ, п. 4.3, 6.3; FR-009, FR-012, FR-014, FR-016).
import { z } from 'zod';
import type { Visibility } from './enums.js';
import type { OwnMotivationProfileDto } from './motivation-profiles.js';
import type { GroupRef, PersonRef, StudentDetailsDto } from './students.js';

/** Максимальная длина текста наблюдения. */
export const OBSERVATION_TEXT_MAX = 2000;
/** Максимальная длина поля «Интересы». */
export const INTERESTS_MAX = 1000;

/** Дисциплина группы студента с преподавателями из действующих закреплений. */
export interface ProfileDisciplineDto {
  id: string;
  name: string;
  teachers: PersonRef[];
}

/** Полная карточка студента для преподавателя (вкладка «Общие сведения»). */
export interface StudentProfileDto extends StudentDetailsDto {
  interests: string | null;
  disciplines: ProfileDisciplineDto[];
}

/** Педагогическое наблюдение для преподавателя: дата, автор, видимость (FR-014, FR-016). */
export interface ObservationDto {
  id: string;
  /** Дата наблюдения, `YYYY-MM-DD`. */
  observedAt: string;
  text: string;
  visibility: Visibility;
  discipline: { id: string; name: string } | null;
  author: PersonRef;
  createdAt: string;
  updatedAt: string;
  /** Изменять наблюдение может только его автор. */
  canEdit: boolean;
}

/** Наблюдение, которое преподаватель открыл студенту. Служебные заметки сюда не попадают. */
export interface StudentVisibleObservationDto {
  id: string;
  observedAt: string;
  text: string;
  discipline: { id: string; name: string } | null;
  author: PersonRef;
}

/** Событие вкладки «История»: значимое изменение по студенту из журнала аудита. */
export interface StudentHistoryItemDto {
  id: string;
  at: string;
  action: string;
  label: string;
  actor: PersonRef | null;
  reason: string | null;
}

/** «Мой профиль» студента: только собственные данные (п. 2.3, AT-12). */
export interface OwnProfileDto {
  participantCode: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  group: GroupRef | null;
  disciplines: ProfileDisciplineDto[];
  interests: string | null;
  observations: StudentVisibleObservationDto[];
  /** Последний утверждённый профиль: только интерпретация для студента (FR-016). */
  motivationProfile: OwnMotivationProfileDto | null;
}

/**
 * Названия событий истории студента. Действия, которых нет в списке, в историю не попадают:
 * вкладка показывает значимые изменения, а не весь технический журнал.
 */
export const STUDENT_HISTORY_LABELS: Record<string, string> = {
  'student.created': 'Студент добавлен',
  'student.updated': 'Изменены Ф. И. О.',
  'student.transferred': 'Перевод в другую группу',
  'student.archived': 'Перенесён в архив',
  'student.restored': 'Возвращён из архива',
  'student.password_reset': 'Выдан новый временный пароль',
  'student.interests_updated': 'Студент изменил свои интересы',
  'observation.created': 'Добавлено педагогическое наблюдение',
  'observation.updated': 'Изменено педагогическое наблюдение',
  'diagnostic_session.completed': 'Пройдена диагностика',
  'diagnostic_session.paper_entered': 'Введены результаты бумажной диагностики',
  'diagnostic_session.corrected': 'Исправлен ошибочный ввод результатов диагностики',
  'motivation_profile.proposed': 'Сформирован предварительный мотивационный профиль',
  'motivation_profile.needs_more_diagnostics':
    'Профиль не сформирован: требуется дополнительная диагностика',
  'motivation_profile.confirmed': 'Мотивационный профиль подтверждён',
  'motivation_profile.corrected': 'Мотивационный профиль скорректирован',
  'trajectory.created': 'Создан черновик ИОТ',
  'trajectory.submitted': 'ИОТ отправлена на согласование',
  'trajectory.returned': 'ИОТ возвращена на доработку',
  'trajectory.approved': 'ИОТ утверждена и назначена',
  'trajectory.archived': 'ИОТ перенесена в архив',
  'trajectory.change_proposed': 'Студент предложил изменить ИОТ',
  'trajectory.needs_correction': 'ИОТ отмечена: требует корректировки',
  'trajectory.corrected': 'ИОТ скорректирована: утверждена новая версия',
  'trajectory.completed': 'ИОТ завершена с итоговой оценкой',
  'trajectory.checkpoint_marked': 'Отмечена контрольная точка ИОТ',
  'student.support_status_changed': 'Изменён статус сопровождения',
  'assignment.submitted': 'Студент отправил задание на проверку',
  'assignment.accepted': 'Задание принято',
  'assignment.returned': 'Задание возвращено на доработку',
  'feedback.resolved': 'Обращение студента рассмотрено',
  'consultation.requested': 'Студент запросил консультацию',
  'consultation.scheduled': 'Назначена консультация',
  'consultation.held': 'Проведена консультация',
  'consultation.cancelled': 'Консультация отменена',
  'reflection.created': 'Студент заполнил рефлексию',
};

// ── Схемы форм (zod) ──

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Сегодняшняя дата по местному времени в формате `YYYY-MM-DD`. */
export function todayIsoDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const observationFormSchema = z.object({
  observedAt: z
    .string()
    .regex(DATE_PATTERN, 'Укажите дату наблюдения')
    .refine((value) => value <= todayIsoDate(), 'Дата наблюдения не может быть в будущем'),
  text: z
    .string()
    .trim()
    .min(1, 'Опишите наблюдение')
    .max(OBSERVATION_TEXT_MAX, `Не более ${OBSERVATION_TEXT_MAX} символов`),
  visibility: z.enum(['INTERNAL', 'STUDENT_VISIBLE']),
  disciplineId: z.string().optional().or(z.literal('')),
});
export type ObservationFormValues = z.infer<typeof observationFormSchema>;

export const interestsFormSchema = z.object({
  interests: z.string().trim().max(INTERESTS_MAX, `Не более ${INTERESTS_MAX} символов`),
});
export type InterestsFormValues = z.infer<typeof interestsFormSchema>;
