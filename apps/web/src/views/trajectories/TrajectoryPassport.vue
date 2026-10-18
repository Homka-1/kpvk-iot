<script setup lang="ts">
import { MOTIVATION_LEVEL_LABELS, type TrajectoryDto } from '@iot/shared';
import { computed } from 'vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate, formatDateTime } from '@/utils/format';
import { trajectoryBadge } from '@/views/students/labels';

/** Паспорт ИОТ (п. 4.6): поля маршрута в одной карточке. */
const props = defineProps<{ trajectory: TrajectoryDto }>();

const currentStage = computed(() => {
  const index = props.trajectory.stages.findIndex(
    (stage) => stage.id === props.trajectory.currentStageId,
  );
  return index < 0 ? null : `${index + 1}. ${props.trajectory.stages[index]!.title}`;
});
const profileLabel = computed(() =>
  props.trajectory.approvedAt
    ? 'Мотивационный профиль на момент назначения'
    : 'Мотивационный профиль (утверждённый)',
);
</script>

<template>
  <section class="iot-card passport" aria-labelledby="passport-title">
    <div class="passport__heading">
      <h2 id="passport-title">Паспорт ИОТ</h2>
      <StatusBadge v-bind="trajectoryBadge(trajectory.status)" />
      <span class="passport__muted">
        {{ trajectory.version ? `Версия ${trajectory.version}` : 'Ещё не утверждалась' }}
      </span>
    </div>
    <dl class="passport__facts">
      <div>
        <dt>Студент</dt>
        <dd>
          <RouterLink :to="`/students/${trajectory.student.id}`">
            {{ trajectory.student.fullName }}
          </RouterLink>
          <span class="passport__muted">
            · {{ trajectory.student.group?.name ?? 'группа не указана' }}
          </span>
        </dd>
      </div>
      <div>
        <dt>Дисциплина</dt>
        <dd>{{ trajectory.discipline.name }}</dd>
      </div>
      <div>
        <dt>Преподаватель</dt>
        <dd>{{ trajectory.teacher?.fullName ?? 'Нет данных' }}</dd>
      </div>
      <div>
        <dt>{{ profileLabel }}</dt>
        <dd>
          <template v-if="trajectory.motivationProfile">
            {{ MOTIVATION_LEVEL_LABELS[trajectory.motivationProfile.level] }}
            <span class="passport__muted">
              (утверждён {{ formatDate(trajectory.motivationProfile.decidedAt) }})
            </span>
          </template>
          <template v-else>Не утверждался</template>
        </dd>
      </div>
      <div>
        <dt>Сроки</dt>
        <dd>
          {{ formatDate(trajectory.startDate) }} – {{ formatDate(trajectory.plannedEndDate) }}
        </dd>
      </div>
      <div>
        <dt>Текущий этап</dt>
        <dd>{{ currentStage ?? 'Определится при утверждении' }}</dd>
      </div>
      <div class="passport__wide">
        <dt>Образовательные цели</dt>
        <dd class="passport__text">{{ trajectory.goals ?? 'Не указаны' }}</dd>
      </div>
      <div class="passport__wide">
        <dt>Планируемые результаты</dt>
        <dd class="passport__text">
          {{ trajectory.plannedResults ?? 'Не указаны' }}
        </dd>
      </div>
      <div v-if="trajectory.approvedAt">
        <dt>Утверждена</dt>
        <dd>{{ formatDateTime(trajectory.approvedAt) }} · {{ trajectory.approvedBy?.fullName }}</dd>
      </div>
      <div v-if="trajectory.template">
        <dt>Шаблон</dt>
        <dd>{{ trajectory.template.title }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.passport__heading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  margin-bottom: var(--iot-space-3);
}

.passport__heading h2 {
  margin: 0;
  font-size: 1.125rem;
}

.passport__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: var(--iot-space-3) var(--iot-space-4);
  margin: 0;
}

.passport__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.passport__facts dd {
  margin: 0;
}

.passport__wide {
  grid-column: 1 / -1;
}

.passport__text {
  white-space: pre-line;
}

.passport__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
