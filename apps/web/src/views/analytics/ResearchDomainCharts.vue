<script setup lang="ts">
import {
  dynamicsShare,
  RESEARCH_GROUP_SHORT,
  RESEARCH_GROUPS,
  type ResearchAnalysisVariableDto,
} from '@iot/shared';
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
import { chartAnimation, chartColor, chartColorAlpha } from '@/utils/chart';
import { formatNumber } from '@/utils/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/**
 * Графики раздела анализа (этап 29): средние «до» и «после» по ЭГ и КГ для каждой шкалы и доли
 * студентов с ростом, без изменений и со снижением. Каждая шкала — отдельный столбец, баллы шкал
 * не складываются. Значения графиков продублированы таблицами карточек показателей (п. 6.1).
 */
const props = defineProps<{ title: string; variables: ResearchAnalysisVariableDto[] }>();

/** Подпись оси не длиннее 24 символов: полное название — в подсказке и в таблицах. */
const short = (text: string) => (text.length > 24 ? `${text.slice(0, 23)}…` : text);
const fullTitle = (labels: string[]) => (items: { dataIndex: number }[]) =>
  labels[items[0]?.dataIndex ?? 0] ?? '';

const GROUP_TOKENS = { EXPERIMENTAL: '--iot-chart-1', CONTROL: '--iot-chart-3' } as const;

const withData = computed(() =>
  props.variables.filter((variable) =>
    variable.groups.some((group) => group.before.n > 0 || group.after.n > 0),
  ),
);
const paired = computed(() => props.variables.filter((variable) => variable.paired));

const meansData = computed<ChartData<'bar', (number | null)[], string>>(() => ({
  labels: withData.value.map((variable) => short(variable.name)),
  datasets: RESEARCH_GROUPS.flatMap((group) => {
    const token = GROUP_TOKENS[group];
    const mean = (phase: 'before' | 'after') =>
      withData.value.map(
        (variable) => variable.groups.find((item) => item.group === group)![phase].mean,
      );
    return [
      {
        label: `${RESEARCH_GROUP_SHORT[group]} — до`,
        data: mean('before'),
        backgroundColor: chartColorAlpha(token, 0.3),
        borderColor: chartColor(token),
        borderWidth: 2,
      },
      {
        label: `${RESEARCH_GROUP_SHORT[group]} — после`,
        data: mean('after'),
        backgroundColor: chartColor(token),
        borderColor: chartColor(token),
        borderWidth: 2,
      },
    ];
  }),
}));

const meansOptions = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimation,
  plugins: {
    legend: { position: 'bottom' },
    tooltip: { callbacks: { title: fullTitle(withData.value.map((variable) => variable.name)) } },
  },
  scales: { y: { beginAtZero: true, title: { display: true, text: 'Среднее' } } },
}));

const dynamicsRows = computed(() =>
  paired.value.flatMap((variable) =>
    variable.groups
      .filter((group) => group.dynamics && group.dynamics.pairs > 0)
      .map((group) => ({
        label: `${variable.name} — ${RESEARCH_GROUP_SHORT[group.group]}`,
        short: `${short(variable.name)} — ${RESEARCH_GROUP_SHORT[group.group]}`,
        dynamics: group.dynamics!,
      })),
  ),
);

const DYNAMICS = [
  { key: 'positive', label: 'Рост', token: '--iot-chart-6' },
  { key: 'zero', label: 'Без изменений', token: '--iot-chart-neutral' },
  { key: 'negative', label: 'Снижение', token: '--iot-chart-5' },
] as const;

const dynamicsData = computed<ChartData<'bar', (number | null)[], string>>(() => ({
  labels: dynamicsRows.value.map((row) => row.short),
  datasets: DYNAMICS.map((item) => ({
    label: item.label,
    data: dynamicsRows.value.map((row) =>
      dynamicsShare(row.dynamics[item.key], row.dynamics.pairs),
    ),
    backgroundColor: chartColor(item.token),
  })),
}));

const dynamicsOptions = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimation,
  plugins: {
    legend: { position: 'bottom' },
    tooltip: {
      callbacks: {
        title: fullTitle(dynamicsRows.value.map((row) => row.label)),
        label: (context) => `${context.dataset.label}: ${formatNumber(Number(context.raw))} %`,
      },
    },
  },
  scales: {
    x: { stacked: true, min: 0, max: 100, title: { display: true, text: '% студентов' } },
    y: { stacked: true },
  },
}));

const dynamicsHeight = computed(() => `${Math.max(160, dynamicsRows.value.length * 34 + 80)}px`);
</script>

<template>
  <div class="domain-charts">
    <figure v-if="withData.length" class="domain-charts__figure">
      <figcaption>{{ title }}: средние значения до и после</figcaption>
      <div class="domain-charts__chart">
        <Bar
          :data="meansData"
          :options="meansOptions"
          role="img"
          :aria-label="`${title}: средние значения ЭГ и КГ до и после по шкалам. Значения приведены в таблицах ниже.`"
        />
      </div>
    </figure>
    <figure v-if="dynamicsRows.length" class="domain-charts__figure">
      <figcaption>{{ title }}: доля студентов с ростом, без изменений и со снижением</figcaption>
      <div class="domain-charts__chart" :style="{ height: dynamicsHeight }">
        <Bar
          :data="dynamicsData"
          :options="dynamicsOptions"
          role="img"
          :aria-label="`${title}: доли студентов ЭГ и КГ с ростом, без изменений и со снижением. Значения приведены в таблицах ниже.`"
        />
      </div>
    </figure>
  </div>
</template>

<style scoped>
.domain-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: var(--iot-space-3);
}

.domain-charts__figure {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  min-width: 0;
}

.domain-charts__figure figcaption {
  font-weight: 600;
  color: var(--iot-color-heading);
}

.domain-charts__chart {
  position: relative;
  height: 280px;
}
</style>
