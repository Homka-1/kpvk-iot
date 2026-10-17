import {
  MOTIVATION_LEVEL_LABELS,
  MOTIVATION_PROFILE_STATUS_LABELS,
  type ProfileFilterValue,
  type StudentSummaryDto,
  SUPPORT_STATUS_LABELS,
  type SupportStatus,
  TRAJECTORY_STATUS_LABELS,
  type TrajectoryStatus,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';

export interface Badge {
  label: string;
  tone: StatusTone;
}

const SUPPORT_TONES: Record<SupportStatus, StatusTone> = {
  STANDARD: 'neutral',
  NEEDS_ATTENTION: 'warning',
  ADDITIONAL_SUPPORT: 'danger',
};

const TRAJECTORY_TONES: Record<TrajectoryStatus, StatusTone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'info',
  ACTIVE: 'success',
  NEEDS_CORRECTION: 'warning',
  COMPLETED: 'success',
  ARCHIVED: 'neutral',
};

export function supportBadge(status: SupportStatus): Badge {
  return { label: SUPPORT_STATUS_LABELS[status], tone: SUPPORT_TONES[status] };
}

export function trajectoryBadge(status: TrajectoryStatus): Badge {
  return { label: TRAJECTORY_STATUS_LABELS[status], tone: TRAJECTORY_TONES[status] };
}

/**
 * Мотивационный профиль: утверждённый уровень; предложение системы — с пометкой, что решение
 * за преподавателем; иначе статус («Требуется дополнительная диагностика»).
 */
export function profileBadge(
  profile: Pick<
    NonNullable<StudentSummaryDto['motivationProfile']>,
    'status' | 'level' | 'proposedLevel'
  >,
): Badge & { icon?: string } {
  if (profile.level) return { label: MOTIVATION_LEVEL_LABELS[profile.level], tone: 'info' };
  if (profile.status === 'PROPOSED' && profile.proposedLevel) {
    return {
      label: `Ждёт решения: ${MOTIVATION_LEVEL_LABELS[profile.proposedLevel].toLowerCase()}`,
      tone: 'neutral',
      icon: 'pi pi-hourglass',
    };
  }
  return { label: MOTIVATION_PROFILE_STATUS_LABELS[profile.status], tone: 'warning' };
}

/** Подписи значений фильтра «Мотивационный профиль» (FR-008). */
export const PROFILE_FILTER_LABELS: Record<ProfileFilterValue, string> = {
  HIGH: MOTIVATION_LEVEL_LABELS.HIGH,
  MEDIUM: MOTIVATION_LEVEL_LABELS.MEDIUM,
  LOW: MOTIVATION_LEVEL_LABELS.LOW,
  PROPOSED: 'Ожидает решения преподавателя',
  NEEDS_MORE_DIAGNOSTICS: MOTIVATION_PROFILE_STATUS_LABELS.NEEDS_MORE_DIAGNOSTICS,
};

export const NO_DATA = 'Нет данных';
