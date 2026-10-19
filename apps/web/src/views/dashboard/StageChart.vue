<script setup lang="ts">
import { type DashboardStageBarDto, STAGE_STATUS_LABELS, type StageStatus } from '@iot/shared';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartData,
  type ChartOptions,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import { chartAnimation, chartColor } from '@/utils/chart';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/**
 * Диаграмма выполнения ИОТ (п. 4.1): сколько маршрутов в работе завершили, ведут или ещё
 * не начали этап с каждым номером. Таблица под диаграммой — текстовая альтернатива.
 */
const props = defineProps<{ bars: DashboardStageBarDto[] }>();

const SERIES: { status: StageStatus; color: string }[] = [
  { status: 'COMPLETED', color: '--iot-chart-2' },
  { status: 'IN_PROGRESS', color: '--iot-chart-1' },
  { status: 'NOT_STARTED', color: '--iot-chart-6' },
];

const labels = computed(() => props.bars.map((bar) => `Этап ${bar.position}`));

const data = computed<ChartData<'bar', number[], string>>(() => ({
  labels: labels.value,
  datasets: SERIES.map((series) => ({
    label: STAGE_STATUS_LABELS[series.status],
    data: props.bars.map((bar) => bar.counts[series.status]),
    backgroundColor: chartColor(series.color),
    maxBarThickness: 36,
  })),
}));

const options: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimation,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { position: 'bottom' } },
  scales: {
    x: { stacked: true },
    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
  },
};
</script>

<template>
  <div>
    <div class="stage-chart">
      <Bar
        :data="data"
        :options="options"
        role="img"
        aria-label="Маршруты по статусу каждого этапа; значения — в таблице ниже"
      />
    </div>
    <details class="stage-chart__details">
      <summary>Показать значения таблицей</summary>
      <table class="stage-chart__table">
        <thead>
          <tr>
            <th scope="col">Этап</th>
            <th v-for="series in SERIES" :key="series.status" scope="col">
              {{ STAGE_STATUS_LABELS[series.status] }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bar in bars" :key="bar.position">
            <th scope="row">{{ bar.position }}</th>
            <td v-for="series in SERIES" :key="series.status">{{ bar.counts[series.status] }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>

<style scoped>
.stage-chart {
  position: relative;
  height: 240px;
}

.stage-chart__details {
  margin-top: var(--iot-space-2);
  font-size: 0.875rem;
}

.stage-chart__table {
  width: 100%;
  border-collapse: collapse;
}

.stage-chart__table th,
.stage-chart__table td {
  padding: var(--iot-space-1) var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
}
</style>
