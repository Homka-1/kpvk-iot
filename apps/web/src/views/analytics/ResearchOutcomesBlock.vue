<script setup lang="ts">
import {
  formatDateRange,
  isResearchControlsKey,
  RESEARCH_GRADES_KEY,
  RESEARCH_GROUP_LABELS,
  RESEARCH_GROUPS,
  type ResearchIndicatorDto,
  type ResearchOutcomesDto,
} from '@iot/shared';
import StatsTable, { type StatsRow } from './StatsTable.vue';

/**
 * Показатели ЭГ и КГ вне диагностики (этап 27): средний балл за семестры и средние оценки
 * педагогических наблюдений на занятиях «до» и «после», баллы входного и итогового контроля по
 * дисциплинам (этап 28), разность у участников с обоими значениями. Пропуски — «Нет данных», а не
 * нули (FR-074).
 */
const props = defineProps<{ outcomes: ResearchOutcomesDto }>();

const NOT_SET = 'не выбран';

function phases(indicator: ResearchIndicatorDto): [string, string] {
  const { outcomes } = props;
  if (isResearchControlsKey(indicator.key)) return ['входной контроль', 'итоговый контроль'];
  if (indicator.key === RESEARCH_GRADES_KEY) {
    return [outcomes.gradesBefore?.label ?? NOT_SET, outcomes.gradesAfter?.label ?? NOT_SET];
  }
  return [
    outcomes.observationsBefore ? formatDateRange(outcomes.observationsBefore) : NOT_SET,
    outcomes.observationsAfter ? formatDateRange(outcomes.observationsAfter) : NOT_SET,
  ];
}

function rows(indicator: ResearchIndicatorDto): StatsRow[] {
  const [before, after] = phases(indicator);
  return RESEARCH_GROUPS.flatMap((group) => {
    const item = props.outcomes.stats.find(
      (row) => row.indicatorKey === indicator.key && row.group === group,
    );
    if (!item) return [];
    const label = RESEARCH_GROUP_LABELS[group];
    return [
      { key: `${group}:before`, label, hint: `До: ${before}`, stats: item.before },
      { key: `${group}:after`, label, hint: `После: ${after}`, stats: item.after },
      { key: `${group}:change`, label, hint: 'Изменение (после − до)', stats: item.change },
    ];
  });
}
</script>

<template>
  <article
    v-for="indicator in outcomes.indicators"
    :key="indicator.key"
    class="research-outcomes__block"
  >
    <h3>{{ indicator.name }}</h3>
    <StatsTable
      :caption="`${indicator.name}: «до», «после» и изменение по группам`"
      :rows="rows(indicator)"
      row-header="Группа и период"
    />
  </article>
</template>

<style scoped>
.research-outcomes__block {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding-top: var(--iot-space-3);
  border-top: 1px solid var(--iot-color-border);
}

.research-outcomes__block h3 {
  margin: 0;
  font-size: 1rem;
}
</style>
