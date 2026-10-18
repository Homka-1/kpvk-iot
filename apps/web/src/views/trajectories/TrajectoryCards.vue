<script setup lang="ts">
import type { TrajectorySummaryDto } from '@iot/shared';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate, formatDateTime } from '@/utils/format';
import { trajectoryBadge } from '@/views/students/labels';

/** Карточки ИОТ: студент, дисциплина, статус, версия, сроки. Клик открывает маршрут. */
withDefaults(defineProps<{ items: TrajectorySummaryDto[]; showStudent?: boolean }>(), {
  showStudent: true,
});
</script>

<template>
  <ul class="trajectory-cards">
    <li v-for="item in items" :key="item.id">
      <RouterLink :to="`/trajectories/${item.id}`" class="iot-card trajectory-cards__card">
        <span class="trajectory-cards__title">
          {{ showStudent ? item.student.fullName : item.discipline.name }}
        </span>
        <span v-if="showStudent" class="trajectory-cards__muted">
          {{ item.discipline.name }} · {{ item.student.group?.name ?? 'группа не указана' }}
        </span>
        <span class="trajectory-cards__badges">
          <StatusBadge v-bind="trajectoryBadge(item.status)" />
          <span class="trajectory-cards__muted">
            {{ item.version ? `Версия ${item.version}` : 'Не утверждалась' }}
          </span>
        </span>
        <span class="trajectory-cards__muted">
          Сроки: {{ formatDate(item.startDate) }} – {{ formatDate(item.plannedEndDate) }} · этапов:
          {{ item.stageCount }}
        </span>
        <span class="trajectory-cards__muted">
          Ведёт: {{ item.teacher?.fullName ?? 'Нет данных' }} · изменена
          {{ formatDateTime(item.updatedAt) }}
        </span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.trajectory-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.trajectory-cards__card {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  height: 100%;
  color: inherit;
  text-decoration: none;
}

.trajectory-cards__card:hover {
  border-color: var(--iot-navy-100);
}

.trajectory-cards__title {
  color: var(--iot-color-heading);
  font-weight: 700;
}

.trajectory-cards__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.trajectory-cards__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
