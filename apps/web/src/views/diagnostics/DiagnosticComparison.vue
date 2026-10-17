<script setup lang="ts">
import {
  type DiagnosticComparisonDto,
  type ComparisonMeasurementDto,
  MEASUREMENT_TYPE_LABELS,
} from '@iot/shared';
import {
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
import { Line } from 'vue-chartjs';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import { formatScore } from './content';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

/**
 * Сравнение замеров по одной методике (FR-015, FR-024; UC-06, AT-10): таблица баллов по шкалам
 * во всех сопоставимых замерах, изменение от базового замера к последнему и график динамики.
 * Пропуск — «Нет данных», а не ноль; на графике — разрыв линии (FR-074). Таблица — текстовая
 * альтернатива графику.
 */
const props = defineProps<{ comparison: DiagnosticComparisonDto }>();

/** Форма точек различает шкалы не только цветом (п. 6.1). */
const POINT_STYLES = ['circle', 'rect', 'triangle', 'rectRot', 'crossRot', 'star'] as const;
const CHART_TOKENS = 6;

const hasDynamics = computed(() => props.comparison.measurements.length > 1);

function measurementTitle(item: ComparisonMeasurementDto): string {
  return MEASUREMENT_TYPE_LABELS[item.measurementType];
}

function cellText(item: ComparisonMeasurementDto, code: string): string {
  const value = item.values[code];
  if (value === undefined || value === null) return 'Нет в этой версии';
  return formatScore(value.rawScore);
}

function missing(item: ComparisonMeasurementDto, code: string): number {
  return item.values[code]?.missingAnswers ?? 0;
}

function changeView(code: string): { text: string; icon: string } {
  const value = props.comparison.changes[code];
  if (value === null || value === undefined) return { text: 'Нет данных', icon: 'pi pi-minus' };
  if (value === 0) return { text: 'Без изменений', icon: 'pi pi-equals' };
  const formatted = formatScore(Math.abs(value));
  return value > 0
    ? { text: `+${formatted}`, icon: 'pi pi-arrow-up-right' }
    : { text: `−${formatted}`, icon: 'pi pi-arrow-down-right' };
}

function token(index: number): string {
  const name = `--iot-chart-${(index % CHART_TOKENS) + 1}`;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#163259';
}

const reducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const chartData = computed<ChartData<'line', (number | null)[], string>>(() => ({
  labels: props.comparison.measurements.map(
    (item) => `${measurementTitle(item)}, ${formatDate(item.completedAt)}`,
  ),
  datasets: props.comparison.scales.map((scale, index) => ({
    label: scale.name || scale.code,
    data: props.comparison.measurements.map((item) => item.values[scale.code]?.rawScore ?? null),
    borderColor: token(index),
    backgroundColor: token(index),
    pointStyle: POINT_STYLES[index % POINT_STYLES.length],
    pointRadius: 5,
    spanGaps: false,
  })),
}));

const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: reducedMotion ? false : { duration: 200 },
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } },
  scales: { y: { title: { display: true, text: 'Балл' } } },
};

const chartLabel = computed(
  () =>
    `График динамики баллов по шкалам: ${props.comparison.title}. Значения приведены в таблице.`,
);
</script>

<template>
  <section class="comparison iot-card" :aria-label="`Сравнение замеров: ${comparison.title}`">
    <div class="comparison__head">
      <h3 class="comparison__title">{{ comparison.title }}</h3>
      <StatusBadge v-if="comparison.isDemo" label="Демо" tone="warning" icon="pi pi-flag" />
    </div>
    <p v-if="!hasDynamics" class="comparison__muted">
      <i class="pi pi-info-circle" aria-hidden="true" /> Пока один замер. Динамика появится после
      повторного замера той же или сопоставимой версии методики.
    </p>
    <div class="comparison__scroll">
      <table class="comparison__table" :aria-label="`Баллы по замерам: ${comparison.title}`">
        <thead>
          <tr>
            <th scope="col">Шкала</th>
            <th v-for="item in comparison.measurements" :key="item.sessionId" scope="col">
              {{ measurementTitle(item) }}
              <span class="comparison__sub">
                {{ formatDate(item.completedAt) }}, версия {{ item.versionNumber }}
              </span>
            </th>
            <th v-if="hasDynamics" scope="col">Изменение</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="scale in comparison.scales" :key="scale.code">
            <th scope="row">{{ scale.name || scale.code }}</th>
            <td v-for="item in comparison.measurements" :key="item.sessionId">
              {{ cellText(item, scale.code) }}
              <span v-if="missing(item, scale.code) > 0" class="comparison__sub">
                без ответа: {{ missing(item, scale.code) }}
              </span>
            </td>
            <td v-if="hasDynamics">
              <i :class="changeView(scale.code).icon" aria-hidden="true" />
              {{ changeView(scale.code).text }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="hasDynamics && comparison.scales.length > 0" class="comparison__chart">
      <Line :data="chartData" :options="chartOptions" :aria-label="chartLabel" role="img" />
    </div>
    <div v-if="comparison.excluded.length > 0" class="comparison__excluded">
      <p class="comparison__muted">Не входят в сравнение:</p>
      <ul>
        <li v-for="item in comparison.excluded" :key="item.sessionId">
          {{ MEASUREMENT_TYPE_LABELS[item.measurementType] }} замер от
          {{ formatDate(item.completedAt) }} (версия {{ item.versionNumber }}): {{ item.reason }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.comparison {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.comparison__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.comparison__title {
  margin: 0;
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.comparison__muted,
.comparison__sub {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}

.comparison__sub {
  display: block;
  font-weight: 400;
}

.comparison__scroll {
  overflow-x: auto;
}

.comparison__table {
  width: 100%;
  border-collapse: collapse;
}

.comparison__table th,
.comparison__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
  vertical-align: top;
}

.comparison__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.comparison__table tbody th {
  font-weight: 600;
}

.comparison__chart {
  position: relative;
  height: 260px;
}

.comparison__excluded ul {
  margin: var(--iot-space-1) 0 0;
  padding-left: var(--iot-space-5);
  font-size: 0.875rem;
}
</style>
