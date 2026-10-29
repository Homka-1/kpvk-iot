<script setup lang="ts">
import { CONTROL_KIND_LABELS, type StudentControlResultsDto } from '@iot/shared';
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
import { computed, onMounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { chartAnimation, chartColor } from '@/utils/chart';
import { formatDate } from '@/utils/format';
import { deltaView } from '@/views/grades/format';
import { resultText, scoreText } from './format';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

/**
 * Контрольные работы студента (этап 28): входной и итоговый балл по дисциплинам с изменением,
 * график индивидуальной динамики и таблица всех результатов (текстовая альтернатива графику).
 * Отметки и пропуски — не ноль: на графике их нет, в таблице они подписаны (FR-074).
 * `source` — адрес API: профиль студента для сотрудника или кабинет для самого студента.
 */
const props = withDefaults(defineProps<{ source: string; title?: string; hint?: string }>(), {
  title: 'Контрольные работы',
  hint: undefined,
});

const POINT_STYLES = ['circle', 'rect', 'triangle', 'rectRot', 'crossRot', 'star'] as const;
const CHART_TOKENS = 6;

const data = ref<StudentControlResultsDto | null>(null);
const error = ref<string | null>(null);

const disciplines = computed(() => {
  const map = new Map((data.value?.results ?? []).map((item) => [item.work.discipline.id, item]));
  return [...map.values()].map((item) => item.work.discipline);
});
const dates = computed(() => [...new Set((data.value?.results ?? []).map((item) => item.date))]);
const scored = computed(() => (data.value?.results ?? []).filter((item) => item.score !== null));

const token = (index: number) => chartColor(`--iot-chart-${(index % CHART_TOKENS) + 1}`);
const chartData = computed<ChartData<'line', (number | null)[], string>>(() => ({
  labels: dates.value.map((date) => formatDate(date)),
  datasets: disciplines.value.map((discipline, index) => ({
    label: discipline.name,
    data: dates.value.map(
      (date) =>
        scored.value.find((item) => item.date === date && item.work.discipline.id === discipline.id)
          ?.score ?? null,
    ),
    borderColor: token(index),
    backgroundColor: token(index),
    pointStyle: POINT_STYLES[index % POINT_STYLES.length],
    pointRadius: 5,
    spanGaps: true,
  })),
}));
const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimation,
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } },
  scales: { y: { min: 0, max: 100, title: { display: true, text: 'Балл' } } },
};

async function load(): Promise<void> {
  error.value = null;
  try {
    data.value = await api<StudentControlResultsDto>(props.source);
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить результаты';
  }
}

watch(() => props.source, load);
onMounted(load);
</script>

<template>
  <section class="control-results" aria-labelledby="control-results-title">
    <h2 id="control-results-title" class="control-results__title">{{ title }}</h2>
    <p v-if="hint" class="control-results__muted">{{ hint }}</p>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="data.results.length === 0"
      icon="pi pi-graduation-cap"
      title="Нет данных"
      description="Результатов контрольных работ пока нет."
    />
    <template v-else>
      <div class="control-results__scroll">
        <table class="control-results__table" aria-label="Входной и итоговый контроль">
          <thead>
            <tr>
              <th scope="col">Дисциплина</th>
              <th scope="col">Входной контроль</th>
              <th scope="col">Итоговый контроль</th>
              <th scope="col">Изменение</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.progress" :key="item.discipline.id">
              <th scope="row">{{ item.discipline.name }}</th>
              <td>{{ scoreText(item.entry) }}</td>
              <td>{{ scoreText(item.final) }}</td>
              <td>
                <i :class="deltaView(item.delta).icon" aria-hidden="true" />
                {{ deltaView(item.delta).text }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="dates.length > 1 && scored.length > 0" class="control-results__chart">
        <Line
          :data="chartData"
          :options="chartOptions"
          role="img"
          aria-label="График динамики баллов за контрольные работы. Значения приведены в таблице ниже."
        />
      </div>

      <div class="control-results__scroll">
        <table class="control-results__table" aria-label="Результаты контрольных работ">
          <thead>
            <tr>
              <th scope="col">Дата</th>
              <th scope="col">Работа</th>
              <th scope="col">Результат</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.results" :key="item.work.id">
              <td>{{ formatDate(item.date) }}</td>
              <td>
                {{ item.work.topic }}
                <span class="control-results__sub">
                  {{ CONTROL_KIND_LABELS[item.work.kind] }} · {{ item.work.discipline.name }}
                </span>
              </td>
              <td>{{ resultText(item) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.control-results {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.control-results__title {
  margin: 0;
  font-size: 1.125rem;
}

.control-results__muted,
.control-results__sub {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.control-results__sub {
  display: block;
  font-size: 0.8125rem;
}

.control-results__chart {
  position: relative;
  height: 16rem;
}

.control-results__scroll {
  overflow-x: auto;
}

.control-results__table {
  width: 100%;
  border-collapse: collapse;
}

.control-results__table th,
.control-results__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
  vertical-align: top;
}

.control-results__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.control-results__table tbody th {
  font-weight: 600;
}
</style>
