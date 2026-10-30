<script setup lang="ts">
import {
  EFFECT_MAGNITUDE_LABELS,
  RESEARCH_GROUP_LABELS,
  RESEARCH_GROUPS,
  RESEARCH_PHASE_LABELS,
  type ResearchAnalysisDto,
  type ResearchComparisonPhase,
  researchCorrelations,
  type ResearchGroup,
  type StatisticalTestResult,
} from '@iot/shared';
import Select from 'primevue/select';
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/format';
import { pText } from './analysis';

/**
 * Ранговые корреляции Спирмена между показателями (этап 29): каждая шкала — отдельный показатель,
 * баллы разных методик не объединяются. Значения «до», «после» или изменения; все участники, ЭГ
 * или КГ. В ячейке — ρ и звёздочки значимости (текстом), подсказка — p и n.
 */
const props = defineProps<{ analysis: ResearchAnalysisDto }>();

const phase = ref<ResearchComparisonPhase>('change');
const group = ref<ResearchGroup | 'ALL'>('ALL');

const phaseOptions = (['before', 'after', 'change'] as const).map((value) => ({
  value,
  label: RESEARCH_PHASE_LABELS[value],
}));
const groupOptions = [
  { value: 'ALL', label: 'Все участники' },
  ...RESEARCH_GROUPS.map((value) => ({ value, label: RESEARCH_GROUP_LABELS[value] })),
];

const matrix = computed(() =>
  researchCorrelations(props.analysis, phase.value, group.value === 'ALL' ? null : group.value),
);

function cell(rowKey: string, columnKey: string): StatisticalTestResult | null {
  return (
    matrix.value.cells.find(
      (item) =>
        (item.rowKey === rowKey && item.columnKey === columnKey) ||
        (item.rowKey === columnKey && item.columnKey === rowKey),
    )?.result ?? null
  );
}

const stars = (p: number | null) => (p === null ? '' : p < 0.01 ? '**' : p < 0.05 ? '*' : '');

function cellText(result: StatisticalTestResult | null): string {
  if (!result || result.statistic === null) return '—';
  return `${formatNumber(Math.round(result.statistic * 100) / 100)}${stars(result.p)}`;
}

function cellTitle(result: StatisticalTestResult | null): string {
  if (!result) return '';
  if (result.statistic === null) return result.note ?? '';
  return `ρ = ${formatNumber(result.statistic)}, ${pText(result.p)}, n = ${result.n}; связь: ${EFFECT_MAGNITUDE_LABELS[result.effectMagnitude!]}`;
}

const strength = (result: StatisticalTestResult | null) =>
  result?.effectMagnitude === 'large' || result?.effectMagnitude === 'medium'
    ? `correlations__cell--${result.effectMagnitude}`
    : '';
</script>

<template>
  <section class="correlations" aria-labelledby="correlations-title">
    <h4 id="correlations-title">Корреляции Спирмена между показателями</h4>
    <div class="correlations__filters">
      <div class="iot-field">
        <label for="correlations-phase">Значения</label>
        <Select
          v-model="phase"
          input-id="correlations-phase"
          :options="phaseOptions"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <div class="iot-field">
        <label for="correlations-group">Участники</label>
        <Select
          v-model="group"
          input-id="correlations-group"
          :options="groupOptions"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
    </div>
    <p v-if="matrix.variables.length < 2" class="correlations__muted" role="status">
      Нет данных: для корреляций нужны хотя бы два показателя
      {{ phase === 'change' ? 'с сопоставимыми парами «до — после»' : 'со значениями' }}.
    </p>
    <template v-else>
      <ol class="correlations__legend">
        <li v-for="variable in matrix.variables" :key="variable.key">
          {{ variable.name }} <span class="correlations__muted">— {{ variable.source }}</span>
        </li>
      </ol>
      <div
        class="correlations__scroll"
        role="region"
        aria-label="Матрица корреляций Спирмена"
        tabindex="0"
      >
        <table class="correlations__table">
          <caption class="iot-visually-hidden">
            Коэффициенты ранговой корреляции Спирмена; номера показателей — по списку выше
          </caption>
          <thead>
            <tr>
              <th scope="col">Показатель</th>
              <th v-for="(_, index) in matrix.variables.slice(0, -1)" :key="index" scope="col">
                {{ index + 1 }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in matrix.variables.slice(1)" :key="row.key">
              <th scope="row" :title="row.name">{{ rowIndex + 2 }}. {{ row.name }}</th>
              <td
                v-for="(column, columnIndex) in matrix.variables.slice(0, -1)"
                :key="column.key"
                :class="columnIndex <= rowIndex ? strength(cell(row.key, column.key)) : ''"
                :title="columnIndex <= rowIndex ? cellTitle(cell(row.key, column.key)) : ''"
              >
                <template v-if="columnIndex <= rowIndex">
                  {{ cellText(cell(row.key, column.key)) }}
                  <span class="iot-visually-hidden">{{
                    cellTitle(cell(row.key, column.key))
                  }}</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="correlations__muted">
        В ячейке — коэффициент ρ; * — p &lt; 0,05, ** — p &lt; 0,01. Подсказка ячейки — p, число пар
        и сила связи (0,1 — слабая, 0,3 — средняя, 0,5 — сильная). «—» — недостаточно пар (нужно не
        менее 5) или нет разброса. Корреляция не означает причинной связи.
      </p>
    </template>
  </section>
</template>

<style scoped>
.correlations {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  min-width: 0;
}

.correlations h4 {
  margin: 0;
  color: var(--iot-color-heading);
}

.correlations__filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--iot-space-3);
}

.correlations__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.correlations__legend {
  margin: 0;
  padding-left: var(--iot-space-5);
}

.correlations__scroll {
  position: relative;
  overflow-x: auto;
  max-width: 100%;
}

.correlations__table {
  border-collapse: collapse;
  font-size: 0.875rem;
}

.correlations__table th,
.correlations__table td {
  padding: var(--iot-space-2);
  border: 1px solid var(--iot-color-border);
  text-align: center;
  white-space: nowrap;
}

.correlations__table th[scope='row'] {
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.correlations__cell--medium {
  background: var(--iot-tone-info-bg);
}

.correlations__cell--large {
  background: var(--iot-color-info-border);
  font-weight: 600;
}

@media (max-width: 599px) {
  .correlations__filters {
    grid-template-columns: 1fr;
  }
}
</style>
