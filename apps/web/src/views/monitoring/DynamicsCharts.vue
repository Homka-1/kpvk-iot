<script setup lang="ts">
import type { MonitoringDynamicsPointDto } from '@iot/shared';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartData,
  type ChartOptions,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { computed } from 'vue';
import { Bar, Line } from 'vue-chartjs';
import { chartAnimation, chartColor } from '@/utils/chart';
import { formatDate, formatNumber } from '@/utils/format';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

/**
 * Динамика показателей по неделям (FR-059): учебная активность — принятые задания и отправленные
 * ответы — и средний результат оценённых заданий. Разные единицы — на разных графиках, без
 * второй оси. Неделя без оценок — разрыв линии, а не ноль (FR-074). Таблица под графиками —
 * текстовая альтернатива.
 */
const props = defineProps<{ points: MonitoringDynamicsPointDto[] }>();

const hasActivity = computed(() =>
  props.points.some((point) => point.completedAssignments > 0 || point.submissions > 0),
);
const hasScores = computed(() => props.points.some((point) => point.averageScore !== null));
const labels = computed(() => props.points.map((point) => `с ${formatDate(point.weekStart)}`));

const activityData = computed<ChartData<'bar', number[], string>>(() => ({
  labels: labels.value,
  datasets: [
    {
      label: 'Принято заданий',
      data: props.points.map((point) => point.completedAssignments),
      backgroundColor: chartColor('--iot-chart-1'),
      borderRadius: 4,
      maxBarThickness: 18,
    },
    {
      label: 'Отправлено ответов',
      data: props.points.map((point) => point.submissions),
      backgroundColor: chartColor('--iot-chart-2'),
      borderRadius: 4,
      maxBarThickness: 18,
    },
  ],
}));

const scoreData = computed<ChartData<'line', (number | null)[], string>>(() => ({
  labels: labels.value,
  datasets: [
    {
      label: 'Средний результат, %',
      data: props.points.map((point) => point.averageScore),
      borderColor: chartColor('--iot-chart-1'),
      backgroundColor: chartColor('--iot-chart-1'),
      borderWidth: 2,
      pointRadius: 4,
      spanGaps: false,
    },
  ],
}));

const common = {
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimation,
  interaction: { mode: 'index' as const, intersect: false },
};

const activityOptions: ChartOptions<'bar'> = {
  ...common,
  plugins: { legend: { position: 'bottom' } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
};

const scoreOptions: ChartOptions<'line'> = {
  ...common,
  plugins: { legend: { display: false } },
  scales: { y: { min: 0, max: 100, ticks: { callback: (value) => `${value} %` } } },
};

const score = (value: number | null) =>
  value === null ? 'Нет данных' : `${formatNumber(value)} %`;
</script>

<template>
  <div class="dynamics">
    <p v-if="points.length === 0" class="dynamics__muted">Выберите период для графика.</p>
    <template v-else>
      <figure class="dynamics__figure">
        <figcaption>Учебная активность по неделям</figcaption>
        <div v-if="hasActivity" class="dynamics__chart">
          <Bar
            :data="activityData"
            :options="activityOptions"
            role="img"
            aria-label="Принятые задания и отправленные ответы по неделям; значения — в таблице ниже"
          />
        </div>
        <p v-else class="dynamics__muted">
          За период ответы не отправлялись и задания не принимались.
        </p>
      </figure>
      <figure class="dynamics__figure">
        <figcaption>Средний результат оценённых заданий</figcaption>
        <div v-if="hasScores" class="dynamics__chart">
          <Line
            :data="scoreData"
            :options="scoreOptions"
            role="img"
            aria-label="Средний результат по неделям в процентах; значения — в таблице ниже"
          />
        </div>
        <p v-else class="dynamics__muted">Нет данных: за период нет оценённых заданий.</p>
      </figure>
      <details class="dynamics__details">
        <summary>Показать значения таблицей</summary>
        <div class="dynamics__scroll">
          <table class="dynamics__table">
            <thead>
              <tr>
                <th scope="col">Неделя</th>
                <th scope="col">Принято заданий</th>
                <th scope="col">Отправлено ответов</th>
                <th scope="col">Средний результат</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in points" :key="point.weekStart">
                <th scope="row">с {{ formatDate(point.weekStart) }}</th>
                <td>{{ point.completedAssignments }}</td>
                <td>{{ point.submissions }}</td>
                <td>{{ score(point.averageScore) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.dynamics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: var(--iot-space-3);
}

.dynamics__figure {
  min-width: 0;
  margin: 0;
}

.dynamics__figure figcaption {
  margin-bottom: var(--iot-space-2);
  font-weight: 600;
}

.dynamics__chart {
  position: relative;
  height: 240px;
}

.dynamics__details {
  grid-column: 1 / -1;
}

.dynamics__scroll {
  overflow-x: auto;
}

.dynamics__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.dynamics__table th,
.dynamics__table td {
  padding: var(--iot-space-1) var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
}

.dynamics__muted {
  margin: 0;
  color: var(--iot-color-muted);
}
</style>
