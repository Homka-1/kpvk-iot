<script setup lang="ts">
import type { ProfileDistributionDto } from '@iot/shared';
import { ArcElement, Chart as ChartJS, type ChartData, type ChartOptions, Tooltip } from 'chart.js';
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { RouterLink } from 'vue-router';
import { chartAnimation, chartColor } from '@/utils/chart';
import { PROFILE_SLICES } from './content';

ChartJS.register(ArcElement, Tooltip);

/**
 * Распределение мотивационных профилей (п. 4.1). Легенда — список с числами и ссылками на
 * отфильтрованный список студентов (FR-003); она же — текстовая альтернатива диаграмме.
 */
const props = defineProps<{ distribution: ProfileDistributionDto }>();

const slices = computed(() =>
  PROFILE_SLICES.map((slice) => ({ ...slice, count: props.distribution[slice.key] })),
);

const data = computed<ChartData<'doughnut', number[], string>>(() => ({
  labels: slices.value.map((slice) => slice.label),
  datasets: [
    {
      data: slices.value.map((slice) => slice.count),
      backgroundColor: slices.value.map((slice) => chartColor(slice.color)),
      borderWidth: 1,
    },
  ],
}));

const options: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimation,
  plugins: { legend: { display: false } },
};

const link = (key: string) =>
  key === 'NONE' ? undefined : { path: '/students', query: { profile: key } };
</script>

<template>
  <div class="profile-chart">
    <div class="profile-chart__canvas">
      <Doughnut
        :data="data"
        :options="options"
        role="img"
        aria-label="Распределение мотивационных профилей; значения — в списке рядом"
      />
    </div>
    <ul class="profile-chart__legend">
      <li v-for="slice in slices" :key="slice.key">
        <span
          class="profile-chart__swatch"
          :style="{ background: `var(${slice.color})` }"
          aria-hidden="true"
        />
        <RouterLink v-if="link(slice.key)" :to="link(slice.key)!">{{ slice.label }}</RouterLink>
        <span v-else>{{ slice.label }}</span>
        <strong class="profile-chart__count">{{ slice.count }}</strong>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.profile-chart {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: var(--iot-space-3);
  align-items: center;
}

.profile-chart__canvas {
  position: relative;
  height: 200px;
}

.profile-chart__legend {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
}

.profile-chart__legend li {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.profile-chart__swatch {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.profile-chart__count {
  margin-left: auto;
}
</style>
