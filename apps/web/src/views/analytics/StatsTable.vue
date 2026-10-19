<script setup lang="ts">
import { DESCRIPTIVE_STATS_COLUMNS, type DescriptiveStats } from '@iot/shared';
import { formatNumber } from '@/utils/format';

export interface StatsRow {
  key: string;
  label: string;
  /** Пояснение под подписью строки (группа, замер). */
  hint?: string;
  stats: DescriptiveStats;
}

/**
 * Таблица описательных статистик (FR-069, FR-070): строка — группа или замер. Наблюдений
 * со значением нет — «Нет данных» вместо нулей (FR-074); пропуски показаны отдельной колонкой
 * (FR-073). Стандартное отклонение при одном значении не рассчитывается — «—». На узком экране
 * таблица прокручивается внутри своего блока.
 */
const props = withDefaults(
  defineProps<{
    caption: string;
    rows: StatsRow[];
    /** Единица значений, например «%». */
    unit?: string;
    /** Подпись первой колонки. */
    rowHeader?: string;
  }>(),
  { unit: '', rowHeader: 'Группа' },
);

const valueColumns = DESCRIPTIVE_STATS_COLUMNS.filter(
  (column) => column.key !== 'n' && column.key !== 'missing',
);

function show(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value)}${props.unit}`;
}
</script>

<template>
  <div class="stats-table" role="region" :aria-label="caption" tabindex="0">
    <table>
      <caption class="iot-visually-hidden">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ rowHeader }}</th>
          <th scope="col">n</th>
          <th scope="col">Пропуски</th>
          <th v-for="column in valueColumns" :key="column.key" scope="col">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <th scope="row">
            {{ row.label }}
            <small v-if="row.hint" class="stats-table__hint">{{ row.hint }}</small>
          </th>
          <td>{{ row.stats.n }}</td>
          <td>{{ row.stats.missing }}</td>
          <td v-if="row.stats.n === 0" :colspan="valueColumns.length" class="stats-table__empty">
            Нет данных
          </td>
          <template v-else>
            <td v-for="column in valueColumns" :key="column.key">
              <span
                v-if="row.stats[column.key] === null"
                title="Не рассчитывается при одном значении"
                >—</span
              >
              <template v-else>{{ show(row.stats[column.key]) }}</template>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.stats-table {
  /* Скрытая подпись таблицы позиционируется внутри контейнера, а не страницы (NFR-004). */
  position: relative;
  overflow-x: auto;
  max-width: 100%;
}

.stats-table table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.stats-table th,
.stats-table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: right;
  white-space: nowrap;
}

.stats-table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.stats-table th[scope='row'],
.stats-table thead th:first-child {
  text-align: left;
  white-space: normal;
  min-width: 8rem;
}

.stats-table__hint {
  display: block;
  color: var(--iot-color-muted);
  font-weight: 400;
}

.stats-table__empty {
  text-align: left;
  color: var(--iot-color-muted);
}
</style>
