<script setup lang="ts">
import {
  buildResearchAnalysis,
  RESEARCH_DOMAIN_LABELS,
  RESEARCH_DOMAINS,
  RESEARCH_GROUP_LABELS,
  RESEARCH_GROUPS,
  type ResearchDataDto,
  type ResearchDomain,
  ResearchGroup,
  significant,
  STATISTICAL_TEST_MIN_N,
} from '@iot/shared';
import { computed } from 'vue';
import MetricCard from '@/components/MetricCard.vue';
import ResearchControlSeries from './ResearchControlSeries.vue';
import ResearchCorrelations from './ResearchCorrelations.vue';
import ResearchDomainCharts from './ResearchDomainCharts.vue';
import ResearchVariableCard from './ResearchVariableCard.vue';

/**
 * Сводный анализ педагогического эксперимента (этап 29): по разделам — мотивация, саморегуляция,
 * академические достижения, наблюдения — каждый показатель отдельно, без объединения баллов разных
 * методик. Перед расчётом — проверки полноты пар, версии методики и шкал. Внутри групп — динамика
 * и критерий Вилкоксона, между ЭГ и КГ — критерий Манна — Уитни; корреляции Спирмена. Расчёт —
 * те же функции, что и выгрузка «Статистический анализ».
 */
const props = defineProps<{ data: ResearchDataDto }>();

const analysis = computed(() => buildResearchAnalysis(props.data));

const ALWAYS_SHOWN: readonly ResearchDomain[] = ['motivation', 'self_regulation', 'academic'];
const DIRECTION_HINT =
  'Раздел определяется направлением методики: его можно указать в карточке методики (раздел «Диагностика»).';
const EMPTY_TEXT: Partial<Record<ResearchDomain, string>> = {
  motivation: `Нет данных: в исследовании нет замеров по методикам направления «Учебная мотивация». ${DIRECTION_HINT}`,
  self_regulation:
    'Нет данных: нет замеров по методикам направления «Саморегуляция». Методика В. И. Моросановой вносится через конструктор методик после передачи заказчиком; укажите у неё направление «Саморегуляция» и зафиксируйте первичный и повторный замеры.',
  academic: 'Нет данных: у участников нет оценок за семестры и баллов за контрольные работы.',
};

const sections = computed(() =>
  RESEARCH_DOMAINS.map((domain) => ({
    domain,
    variables: analysis.value.variables.filter((variable) => variable.domain === domain),
    series: domain === 'academic' ? props.data.outcomes.controlSeries : [],
  })).filter((section) => section.variables.length > 0 || ALWAYS_SHOWN.includes(section.domain)),
);

const groupSize = (group: ResearchGroup) =>
  analysis.value.participants.filter((participant) => participant.group === group).length;

const summary = computed(() => {
  const variables = analysis.value.variables;
  const paired = variables.filter((variable) => variable.paired);
  const grownIn = (group: ResearchGroup) =>
    paired.filter((variable) => {
      const own = variable.groups.find((item) => item.group === group)!;
      return own.wilcoxon && significant(own.wilcoxon) && (own.change?.median ?? 0) > 0;
    }).length;
  return {
    total: variables.length,
    paired: paired.length,
    grownEg: grownIn(ResearchGroup.EXPERIMENTAL),
    grownCg: grownIn(ResearchGroup.CONTROL),
    between: paired.filter(
      (variable) => variable.between.change && significant(variable.between.change),
    ).length,
  };
});
</script>

<template>
  <section class="analysis" aria-labelledby="analysis-title">
    <h3 id="analysis-title">Статистический анализ эксперимента: ЭГ и КГ</h3>
    <p class="analysis__note">
      Каждая шкала и каждый показатель анализируются отдельно: баллы разных методик не складываются.
      «До» и «после» — первый и последний замер методики, выбранные семестры, входной и итоговый
      контроль, периоды наблюдений. Внутри групп — критерий Вилкоксона, между ЭГ и КГ — критерий
      Манна — Уитни; уровень значимости 0,05; размер эффекта r = |Z|/√N (0,1 — малый, 0,3 — средний,
      0,5 — большой). Критерии считаются при {{ STATISTICAL_TEST_MIN_N }} и более парах в группе.
    </p>

    <div class="analysis__metrics">
      <MetricCard
        v-for="group in RESEARCH_GROUPS"
        :key="group"
        :label="RESEARCH_GROUP_LABELS[group]"
        :value="groupSize(group)"
        unit="участников"
        icon="pi pi-users"
      />
      <MetricCard
        label="Показатели с сопоставимыми парами"
        :value="summary.total ? `${summary.paired} из ${summary.total}` : null"
        hint="Прошли проверки версии, шкалы и периодов"
        icon="pi pi-check-square"
      />
      <MetricCard
        label="Значимый рост: ЭГ / КГ"
        :value="summary.paired ? `${summary.grownEg} / ${summary.grownCg}` : null"
        hint="Число показателей, критерий Вилкоксона, p < 0,05"
        icon="pi pi-arrow-up-right"
      />
      <MetricCard
        label="Различие изменений ЭГ и КГ"
        :value="summary.paired ? summary.between : null"
        hint="Число показателей, критерий Манна — Уитни, p < 0,05"
        icon="pi pi-arrows-h"
      />
    </div>

    <section
      v-for="section in sections"
      :key="section.domain"
      class="analysis__domain"
      :aria-labelledby="`analysis-domain-${section.domain}`"
    >
      <h4 :id="`analysis-domain-${section.domain}`">
        {{ RESEARCH_DOMAIN_LABELS[section.domain] }}
      </h4>
      <p v-if="section.domain === 'other'" class="analysis__note">
        Методики без направления «Учебная мотивация» или «Саморегуляция». {{ DIRECTION_HINT }}
      </p>
      <p
        v-if="section.variables.length === 0 && section.series.length === 0"
        class="analysis__note"
        role="status"
      >
        {{ EMPTY_TEXT[section.domain] }}
      </p>
      <template v-else>
        <ResearchDomainCharts
          :title="RESEARCH_DOMAIN_LABELS[section.domain]"
          :variables="section.variables"
        />
        <ResearchControlSeries
          v-for="series in section.series"
          :key="series.discipline.id"
          :series="series"
        />
        <ResearchVariableCard
          v-for="variable in section.variables"
          :key="variable.key"
          :variable="variable"
        />
      </template>
    </section>

    <ResearchCorrelations :analysis="analysis" />
  </section>
</template>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  padding-top: var(--iot-space-3);
  border-top: 1px solid var(--iot-color-border);
  min-width: 0;
}

.analysis h3 {
  margin: 0;
  font-size: 1.125rem;
}

.analysis__note {
  margin: 0;
  color: var(--iot-color-muted);
}

.analysis__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: var(--iot-space-3);
}

.analysis__domain {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  padding: var(--iot-space-3);
  border-radius: var(--iot-radius);
  background: var(--iot-color-bg);
  min-width: 0;
}

.analysis__domain h4 {
  margin: 0;
  color: var(--iot-color-heading);
}
</style>
