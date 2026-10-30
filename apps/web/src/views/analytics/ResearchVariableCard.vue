<script setup lang="ts">
import {
  dynamicsShare,
  RESEARCH_CHECK_STATUS_LABELS,
  RESEARCH_GROUP_LABELS,
  RESEARCH_PHASE_LABELS,
  type ResearchAnalysisVariableDto,
  type ResearchComparisonPhase,
  type ResearchDynamicsDto,
} from '@iot/shared';
import { computed } from 'vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatNumber } from '@/utils/format';
import {
  CHECK_TONES,
  effectText,
  numText,
  pText,
  significanceBadge,
  variableConclusion,
} from './analysis';

/**
 * Показатель анализа эксперимента (этап 29): проверки данных, краткий вывод, описательные
 * статистики и динамика внутри ЭГ и КГ (критерий Вилкоксона), сравнение групп (критерий
 * Манна — Уитни). Пропуски — «—» и «Нет данных», не нули (FR-074).
 */
const props = defineProps<{ variable: ResearchAnalysisVariableDto }>();

const PHASES: ResearchComparisonPhase[] = ['before', 'after', 'change'];
const conclusion = computed(() => variableConclusion(props.variable));

/** Итог проверок для заголовка: худший из статусов. */
const overall = computed(() => {
  const statuses = props.variable.checks.map((check) => check.status);
  if (statuses.includes('error')) {
    return { label: 'Есть непройденные проверки', tone: CHECK_TONES.error };
  }
  if (statuses.includes('warning'))
    return { label: 'Есть предупреждения', tone: CHECK_TONES.warning };
  return { label: 'Проверки пройдены', tone: CHECK_TONES.ok };
});

const meanSd = (stats: { mean: number | null; sd: number | null } | null) =>
  !stats || stats.mean === null
    ? 'Нет данных'
    : stats.sd === null
      ? formatNumber(stats.mean)
      : `${formatNumber(stats.mean)} ± ${formatNumber(stats.sd)}`;

const share = (count: number, dynamics: ResearchDynamicsDto) => {
  const value = dynamicsShare(count, dynamics.pairs);
  return value === null ? '—' : `${count} (${formatNumber(value)} %)`;
};
</script>

<template>
  <details class="variable">
    <summary class="variable__head">
      <span class="variable__title">{{ variable.name }}</span>
      <span class="variable__muted">{{ variable.source }}</span>
      <StatusBadge v-bind="overall" />
    </summary>
    <div class="variable__body">
      <ul class="variable__checks" aria-label="Проверки данных">
        <li v-for="check in variable.checks" :key="check.name">
          <StatusBadge
            :label="`${check.name}: ${RESEARCH_CHECK_STATUS_LABELS[check.status].toLowerCase()}`"
            :tone="CHECK_TONES[check.status]"
          />
          <span class="variable__muted">{{ check.text }}</span>
        </li>
      </ul>

      <div class="variable__conclusion">
        <i class="pi pi-info-circle" aria-hidden="true" />
        <div>
          <p v-for="line in conclusion" :key="line">{{ line }}</p>
        </div>
      </div>

      <div
        class="variable__scroll"
        role="region"
        :aria-label="`${variable.name}: внутри групп`"
        tabindex="0"
      >
        <table class="variable__table">
          <caption class="iot-visually-hidden">
            {{
              variable.name
            }}: описательные статистики, динамика и критерий Вилкоксона по группам
          </caption>
          <thead>
            <tr>
              <th scope="col">Группа</th>
              <th scope="col">До: M ± SD (Me)</th>
              <th scope="col">После: M ± SD (Me)</th>
              <th scope="col">Изменение: M ± SD (Me)</th>
              <th scope="col">Пар</th>
              <th scope="col"><i class="pi pi-arrow-up" aria-hidden="true" /> Рост</th>
              <th scope="col"><i class="pi pi-minus" aria-hidden="true" /> Без изменений</th>
              <th scope="col"><i class="pi pi-arrow-down" aria-hidden="true" /> Снижение</th>
              <th scope="col">Вилкоксон</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in variable.groups" :key="group.group">
              <th scope="row">
                {{ RESEARCH_GROUP_LABELS[group.group] }}
                <small class="variable__muted">участников: {{ group.participants }}</small>
              </th>
              <td>
                {{ meanSd(group.before) }}
                <small v-if="group.before.median !== null"
                  >Me = {{ numText(group.before.median) }}</small
                >
              </td>
              <td>
                {{ meanSd(group.after) }}
                <small v-if="group.after.median !== null"
                  >Me = {{ numText(group.after.median) }}</small
                >
              </td>
              <td>
                {{ group.change ? meanSd(group.change) : '—' }}
                <small v-if="group.change?.median != null"
                  >Me = {{ numText(group.change.median) }}</small
                >
              </td>
              <td>{{ group.dynamics?.pairs ?? '—' }}</td>
              <td>{{ group.dynamics ? share(group.dynamics.positive, group.dynamics) : '—' }}</td>
              <td>{{ group.dynamics ? share(group.dynamics.zero, group.dynamics) : '—' }}</td>
              <td>{{ group.dynamics ? share(group.dynamics.negative, group.dynamics) : '—' }}</td>
              <td class="variable__test">
                <template v-if="group.wilcoxon && group.wilcoxon.p !== null">
                  T = {{ numText(group.wilcoxon.statistic) }}, {{ pText(group.wilcoxon.p) }}
                  <small>{{ effectText(group.wilcoxon) }}</small>
                  <StatusBadge v-bind="significanceBadge(group.wilcoxon)" />
                </template>
                <small v-else>{{ group.wilcoxon?.note ?? 'Не рассчитывается' }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        class="variable__scroll"
        role="region"
        :aria-label="`${variable.name}: ЭГ и КГ`"
        tabindex="0"
      >
        <table class="variable__table">
          <caption class="iot-visually-hidden">
            {{
              variable.name
            }}: сравнение ЭГ и КГ, критерий Манна — Уитни
          </caption>
          <thead>
            <tr>
              <th scope="col">ЭГ и КГ (Манн — Уитни)</th>
              <th scope="col">n ЭГ / КГ</th>
              <th scope="col">U</th>
              <th scope="col">p</th>
              <th scope="col">Размер эффекта</th>
              <th scope="col">Вывод</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="phase in PHASES" :key="phase">
              <th scope="row">{{ RESEARCH_PHASE_LABELS[phase] }}</th>
              <template v-if="variable.between[phase] && variable.between[phase]!.p !== null">
                <td>{{ variable.between[phase]!.n1 }} / {{ variable.between[phase]!.n2 }}</td>
                <td>{{ numText(variable.between[phase]!.statistic) }}</td>
                <td>{{ pText(variable.between[phase]!.p) }}</td>
                <td>{{ effectText(variable.between[phase]!) }}</td>
                <td><StatusBadge v-bind="significanceBadge(variable.between[phase])" /></td>
              </template>
              <td v-else colspan="5" class="variable__muted">
                {{ variable.between[phase]?.note ?? 'Не рассчитывается: пары несопоставимы' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </details>
</template>

<style scoped>
.variable {
  padding: var(--iot-space-3);
  background: var(--iot-color-surface);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
  min-width: 0;
}

.variable__body {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin-top: var(--iot-space-3);
  min-width: 0;
}

.variable__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-1) var(--iot-space-3);
  cursor: pointer;
}

.variable__title {
  font-weight: 600;
  color: var(--iot-color-heading);
}

.variable__conclusion p {
  margin: 0;
}

.variable__muted {
  color: var(--iot-color-muted);
}

.variable__checks {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.variable__checks li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-1) var(--iot-space-2);
}

.variable__conclusion {
  display: flex;
  gap: var(--iot-space-2);
  padding: var(--iot-space-2) var(--iot-space-3);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-info-text);
}

.variable__conclusion > i {
  margin-top: 3px;
}

.variable__scroll {
  /* Скрытая подпись таблицы позиционируется внутри контейнера, а не страницы (NFR-004). */
  position: relative;
  overflow-x: auto;
  max-width: 100%;
}

.variable__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.variable__table th,
.variable__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: right;
  vertical-align: top;
  white-space: nowrap;
}

.variable__table th[scope='row'],
.variable__table thead th:first-child {
  text-align: left;
}

.variable__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.variable__table small {
  display: block;
  color: var(--iot-color-muted);
}

.variable__test {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--iot-space-1);
}
</style>
