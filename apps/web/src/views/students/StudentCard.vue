<script setup lang="ts">
import { formatFullName, type StudentSummaryDto } from '@iot/shared';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime, formatNumber } from '@/utils/format';
import { NO_DATA, profileBadge, trajectoryBadge } from './labels';
import SupportStatusBadge from './SupportStatusBadge.vue';

/**
 * Карточка студента в списке (п. 4.2 ТЗ). Показатели, по которым ещё нет данных, подписаны
 * «Нет данных» — без нулей (FR-005).
 */
defineProps<{
  student: StudentSummaryDto;
  /** Адрес профиля студента; без него имя выводится обычным текстом. */
  to?: string;
}>();
</script>

<template>
  <article class="student-card iot-card">
    <header class="student-card__header">
      <div class="student-card__title">
        <RouterLink v-if="to" :to="to" class="student-card__name">
          {{ formatFullName(student) }}
        </RouterLink>
        <span v-else class="student-card__name">{{ formatFullName(student) }}</span>
        <span class="student-card__code">Код участника: {{ student.participantCode }}</span>
      </div>
      <StatusBadge v-if="student.archivedAt" label="В архиве" tone="neutral" icon="pi pi-box" />
      <SupportStatusBadge
        v-else
        :student-id="student.id"
        :status="student.supportStatus"
        :interactive="!!to"
      />
    </header>
    <p class="student-card__group">
      <template v-if="student.group">
        {{ student.group.name }} · {{ student.group.course }} курс · {{ student.group.specialty }}
      </template>
      <template v-else>Группа не указана</template>
    </p>
    <dl class="student-card__facts">
      <div>
        <dt>Мотивационный профиль</dt>
        <dd>
          <StatusBadge
            v-if="student.motivationProfile"
            v-bind="profileBadge(student.motivationProfile)"
          />
          <span v-else class="student-card__empty">{{ NO_DATA }}</span>
        </dd>
      </div>
      <div>
        <dt>Текущая ИОТ</dt>
        <dd>
          <template v-if="student.currentTrajectory">
            {{ student.currentTrajectory.disciplineName }}
            <StatusBadge v-bind="trajectoryBadge(student.currentTrajectory.status)" />
          </template>
          <span v-else class="student-card__empty">Нет ИОТ</span>
        </dd>
      </div>
      <div>
        <dt>Прогресс маршрута</dt>
        <dd :class="{ 'student-card__empty': student.currentTrajectory?.progress == null }">
          {{
            student.currentTrajectory?.progress == null
              ? NO_DATA
              : `${formatNumber(student.currentTrajectory.progress)} %`
          }}
        </dd>
      </div>
      <div>
        <dt>Средний показатель успеваемости</dt>
        <dd :class="{ 'student-card__empty': student.averageScore == null }">
          {{ student.averageScore == null ? NO_DATA : formatNumber(student.averageScore) }}
        </dd>
      </div>
      <div>
        <dt>Выполнено заданий</dt>
        <dd :class="{ 'student-card__empty': student.completedAssignments == null }">
          {{ student.completedAssignments ?? NO_DATA }}
        </dd>
      </div>
      <div>
        <dt>Последняя активность</dt>
        <dd :class="{ 'student-card__empty': !student.lastActivityAt }">
          {{ student.lastActivityAt ? formatDateTime(student.lastActivityAt) : NO_DATA }}
        </dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.student-card {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  min-width: 0;
}

.student-card__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.student-card__title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.student-card__name {
  color: var(--iot-navy-700);
  font-size: 1.0625rem;
  font-weight: 700;
  text-decoration: none;
  overflow-wrap: anywhere;
}

a.student-card__name:hover {
  text-decoration: underline;
}

.student-card__code,
.student-card__group {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.student-card__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: var(--iot-space-2) var(--iot-space-3);
  margin: 0;
}

.student-card__facts > div {
  min-width: 0;
}

/* Длинный статус («Требуется дополнительная диагностика») переносится внутри своей колонки. */
.student-card__facts :deep(.status-badge) {
  max-width: 100%;
  white-space: normal;
}

.student-card__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.75rem;
}

.student-card__facts dd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-1);
  margin: 0;
  font-weight: 600;
}

.student-card__facts .student-card__empty,
.student-card__empty {
  color: var(--iot-color-muted);
  font-weight: 400;
}
</style>
