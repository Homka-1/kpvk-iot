import {
  RESEARCH_PROJECT_STATUS_LABELS,
  type ResearchMeasurementDto,
  type ResearchProjectStatus,
  MEASUREMENT_TYPE_LABELS,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';

/** Статус исследования: текст, тон и иконка (не только цвет, п. 6.1). */
export function researchStatusBadge(status: ResearchProjectStatus): {
  label: string;
  tone: StatusTone;
  icon?: string;
} {
  const label = RESEARCH_PROJECT_STATUS_LABELS[status];
  switch (status) {
    case 'DRAFT':
      return { label, tone: 'neutral', icon: 'pi pi-pencil' };
    case 'ACTIVE':
      return { label, tone: 'info', icon: 'pi pi-play' };
    case 'COMPLETED':
      return { label, tone: 'success' };
    case 'ARCHIVED':
      return { label, tone: 'neutral', icon: 'pi pi-box' };
  }
}

/** Период «с … по …»; без дат — «без ограничения». */
export function periodText(startsOn: string | null, endsOn: string | null): string {
  if (!startsOn && !endsOn) return 'без ограничения';
  if (startsOn && endsOn) return `${formatDate(startsOn)} — ${formatDate(endsOn)}`;
  return startsOn ? `с ${formatDate(startsOn)}` : `по ${formatDate(endsOn)}`;
}

export function measurementText(measurement: ResearchMeasurementDto): string {
  return `${MEASUREMENT_TYPE_LABELS[measurement.measurementType]} · ${measurement.questionnaire.title}, версия ${measurement.questionnaire.versionNumber}`;
}
