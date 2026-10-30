<script setup lang="ts">
import {
  CONTROL_KIND_LABELS,
  RESEARCH_GROUP_LABELS,
  RESEARCH_GROUP_SHORT,
  RESEARCH_GROUPS,
  type ResearchControlSeriesDto,
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
import { chartAnimation, chartColor } from '@/utils/chart';
import { formatDate } from '@/utils/format';
import { numText } from './analysis';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

/**
 * Академические достижения по контрольным работам (этап 29): средний балл ЭГ и КГ по каждой
 * работе дисциплины — входной, текущий и итоговый контроль по датам. График дублируется
 * таблицей; работа без баллов у группы — «Нет данных», на графике пропуск (FR-074).
 */
const props = defineProps<{ series: ResearchControlSeriesDto }>();

const STYLE = {
  EXPERIMENTAL: { token: '--iot-chart-1', point: 'circle' },
  CONTROL: { token: '--iot-chart-3', point: 'rect' },
} as const;

const statsOf = (workId: string, group: (typeof RESEARCH_GROUPS)[number]) =>
  props.series.stats.find((row) => row.workId === workId && row.group === group)!.stats;

const workLabel = (work: ResearchControlSeriesDto['works'][number]) =>
  `${CONTROL_KIND_LABELS[work.kind]}, ${formatDate(work.date)}`;

const chartData = computed<ChartData<'line', (number | null)[], string>>(() => ({
  labels: props.series.works.map(workLabel),
  datasets: RESEARCH_GROUPS.map((group) => ({
    label: RESEARCH_GROUP_SHORT[group],
    data: props.series.works.map((work) => statsOf(work.id, group).mean),
    borderColor: chartColor(STYLE[group].token),
    backgroundColor: chartColor(STYLE[group].token),
    pointStyle: STYLE[group].point,
    pointRadius: 5,
    spanGaps: true,
  })),
}));

const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimation,
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } },
  scales: { y: { min: 0, max: 100, title: { display: true, text: 'Средний балл' } } },
};
</script>

<template>
  <article class="control-series" :aria-label="`Контрольные работы: ${series.discipline.name}`">
    <h5>Контрольные работы: {{ series.discipline.name }}</h5>
    <div v-if="series.works.length > 1" class="control-series__chart">
      <Line
        :data="chartData"
        :options="chartOptions"
        role="img"
        :aria-label="`Средний балл ЭГ и КГ по контрольным работам дисциплины «${series.discipline.name}». Значения приведены в таблице ниже.`"
      />
    </div>
    <div
      class="control-series__scroll"
      role="region"
      :aria-label="`Контрольные работы: ${series.discipline.name}`"
      tabindex="0"
    >
      <table class="control-series__table">
        <caption class="iot-visually-hidden">
          Средний балл, медиана и стандартное отклонение ЭГ и КГ по контрольным работам
        </caption>
        <thead>
          <tr>
            <th scope="col">Работа</th>
            <th v-for="group in RESEARCH_GROUPS" :key="group" scope="col">
              {{ RESEARCH_GROUP_LABELS[group] }}: M ± SD (Me), n
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="work in series.works" :key="work.id">
            <th scope="row">
              {{ workLabel(work) }}
              <small>{{ work.topic }}</small>
            </th>
            <td v-for="group in RESEARCH_GROUPS" :key="group">
              <template v-if="statsOf(work.id, group).n > 0">
                {{ numText(statsOf(work.id, group).mean) }}
                <template v-if="statsOf(work.id, group).sd !== null">
                  ± {{ numText(statsOf(work.id, group).sd) }}
                </template>
                (Me = {{ numText(statsOf(work.id, group).median) }}), n =
                {{ statsOf(work.id, group).n }}
              </template>
              <template v-else>Нет данных</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>

<style scoped>
.control-series {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  min-width: 0;
}

.control-series h5 {
  margin: 0;
  font-size: 1rem;
  color: var(--iot-color-heading);
}

.control-series__chart {
  position: relative;
  height: 260px;
}

.control-series__scroll {
  position: relative;
  overflow-x: auto;
  max-width: 100%;
}

.control-series__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.control-series__table th,
.control-series__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: right;
  vertical-align: top;
}

.control-series__table th[scope='row'],
.control-series__table thead th:first-child {
  text-align: left;
}

.control-series__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.control-series__table small {
  display: block;
  color: var(--iot-color-muted);
  font-weight: 400;
}
</style>
