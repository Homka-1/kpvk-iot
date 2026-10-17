import {
  MOTIVATION_LEVEL_LABELS,
  MOTIVATION_PROFILE_STATUS_LABELS,
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

/** Мотивационный профиль: уровень, если он определён, иначе статус («Требуется дополнительная диагностика»). */
export function profileBadge(profile: NonNullable<StudentSummaryDto['motivationProfile']>): Badge {
  if (profile.level) return { label: MOTIVATION_LEVEL_LABELS[profile.level], tone: 'info' };
  return { label: MOTIVATION_PROFILE_STATUS_LABELS[profile.status], tone: 'warning' };
}

export const NO_DATA = 'Нет данных';
