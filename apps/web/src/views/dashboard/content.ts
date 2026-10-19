import type {
  DashboardActivityDto,
  DashboardActivityKind,
  DashboardUpcomingDto,
  MonitoringPeriodDto,
  ProfileFilterValue,
} from '@iot/shared';
import type { RouteLocationRaw } from 'vue-router';
import type { StatusTone } from '@/components/StatusBadge.vue';
import { PROFILE_FILTER_LABELS } from '@/views/students/labels';

/** Что сделал студент — подпись события ленты «Последняя активность». */
export const ACTIVITY_LABELS: Record<DashboardActivityKind, string> = {
  SUBMISSION: 'Ответ на задание',
  DIAGNOSTIC: 'Пройдена диагностика',
  QUESTION: 'Вопрос преподавателю',
  DIFFICULTY_REPORT: 'Сообщение о затруднении',
  CONSULTATION_REQUEST: 'Запрос консультации',
  REFLECTION: 'Рефлексия',
};

export const ACTIVITY_ICONS: Record<DashboardActivityKind, string> = {
  SUBMISSION: 'pi pi-send',
  DIAGNOSTIC: 'pi pi-list-check',
  QUESTION: 'pi pi-question-circle',
  DIFFICULTY_REPORT: 'pi pi-exclamation-triangle',
  CONSULTATION_REQUEST: 'pi pi-calendar',
  REFLECTION: 'pi pi-pencil',
};

/** Нерассмотренное обращение отмечается бейджем (текст + значок, не только цвет). */
export const OPEN_BADGE = {
  label: 'Не рассмотрено',
  tone: 'warning' as StatusTone,
  icon: 'pi pi-clock',
};

/** Куда ведёт событие: к проверке ответа, в «Обратную связь» или в профиль студента. */
export function activityLink(item: DashboardActivityDto): RouteLocationRaw {
  const profile = (tab: string) => ({ path: `/students/${item.student.id}`, query: { tab } });
  switch (item.kind) {
    case 'SUBMISSION':
      return item.reviewId ? `/assignments/review/${item.reviewId}` : profile('assignments');
    case 'DIAGNOSTIC':
      return profile('diagnostics');
    case 'QUESTION':
    case 'DIFFICULTY_REPORT':
      return { path: '/feedback', query: { tab: 'requests' } };
    case 'CONSULTATION_REQUEST':
      return { path: '/feedback', query: { tab: 'consultations' } };
    case 'REFLECTION':
      return profile('support');
  }
}

export function upcomingLink(item: DashboardUpcomingDto): RouteLocationRaw {
  if (item.kind === 'CHECKPOINT' && item.trajectoryId) return `/monitoring/${item.trajectoryId}`;
  return { path: '/feedback', query: { tab: 'consultations' } };
}

/** Период панели в адресе мониторинга: карточка ведёт к тому же отбору (FR-003). */
export function periodQuery(period: MonitoringPeriodDto): Record<string, string> {
  return Object.fromEntries(
    Object.entries(period).filter((entry): entry is [string, string] => entry[1] !== null),
  );
}

/** Категории диаграммы мотивационных профилей и фильтр списка студентов для каждой. */
export const PROFILE_SLICES: { key: ProfileFilterValue | 'NONE'; label: string; color: string }[] =
  [
    { key: 'HIGH', label: PROFILE_FILTER_LABELS.HIGH, color: '--iot-chart-2' },
    { key: 'MEDIUM', label: PROFILE_FILTER_LABELS.MEDIUM, color: '--iot-chart-1' },
    { key: 'LOW', label: PROFILE_FILTER_LABELS.LOW, color: '--iot-chart-3' },
    { key: 'PROPOSED', label: PROFILE_FILTER_LABELS.PROPOSED, color: '--iot-chart-4' },
    {
      key: 'NEEDS_MORE_DIAGNOSTICS',
      label: PROFILE_FILTER_LABELS.NEEDS_MORE_DIAGNOSTICS,
      color: '--iot-chart-5',
    },
    { key: 'NONE', label: 'Профиль не формировался', color: '--iot-chart-6' },
  ];
