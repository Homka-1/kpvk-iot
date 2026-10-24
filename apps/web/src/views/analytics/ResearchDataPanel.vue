<script setup lang="ts">
import {
  type AcademicPeriodDto,
  dateRangeSet,
  dateRangesOverlap,
  DiagnosticExportFormat,
  RESEARCH_DATASET_LABELS,
  RESEARCH_GROUP_LABELS,
  type ResearchDataDto,
  ResearchDataset,
  type ResearchMeasurementDto,
  type ResearchOutcomesDto,
  type ResearchScaleDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { api, apiDownload, ApiError } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { measurementText, periodText } from './research';
import ResearchOutcomesBlock from './ResearchOutcomesBlock.vue';
import StatsTable, { type StatsRow } from './StatsTable.vue';

/**
 * Данные исследования (UC-07): выбор замеров и шкал → полные и неполные наблюдения ЭГ и КГ,
 * описательные статистики (FR-069, FR-070), изменение между замерами только по сопоставимым
 * версиям (FR-072); средний балл за семестры и наблюдения на занятиях «до/после» (этап 27);
 * обезличенный экспорт исходных, сводных и «широких» данных в CSV или XLSX (FR-071, FR-075).
 * Пропуски — «Нет данных», а не нули (FR-074).
 */
const props = defineProps<{
  projectId: string;
  measurements: ResearchMeasurementDto[];
  canExport: boolean;
}>();

const measurementIds = ref<string[]>([]);
const scaleKeys = ref<string[]>([]);
/** Все шкалы замеров исследования — варианты выбора, не зависят от текущего выбора. */
const allScales = ref<ResearchScaleDto[]>([]);
const data = ref<ResearchDataDto | null>(null);
const error = ref<string | null>(null);
const dataset = ref<ResearchDataset>(ResearchDataset.RAW);
const format = ref<DiagnosticExportFormat>(DiagnosticExportFormat.XLSX);
const exportBusy = ref(false);
const exportError = ref<string | null>(null);
const exported = ref(false);

// Успеваемость и наблюдения «до/после» (этап 27). Пока ничего не выбрано, сервер берёт значения
// по умолчанию, и они подставляются в поля.
const gradesBefore = ref<string | null>(null);
const gradesAfter = ref<string | null>(null);
const observationsBeforeFrom = ref('');
const observationsBeforeTo = ref('');
const observationsAfterFrom = ref('');
const observationsAfterTo = ref('');
/** Семестры с оценками участников — варианты выбора. */
const periods = ref<AcademicPeriodDto[]>([]);
let applyingDefaults = false;

const outcomeRefs = [
  gradesBefore,
  gradesAfter,
  observationsBeforeFrom,
  observationsBeforeTo,
  observationsAfterFrom,
  observationsAfterTo,
];
const outcomesEmpty = () => outcomeRefs.every((item) => !item.value);

const outcomeError = computed(() => {
  if (gradesBefore.value && gradesBefore.value === gradesAfter.value) {
    return 'Выберите разные семестры «до» и «после».';
  }
  const before = {
    from: observationsBeforeFrom.value || null,
    to: observationsBeforeTo.value || null,
  };
  const after = {
    from: observationsAfterFrom.value || null,
    to: observationsAfterTo.value || null,
  };
  if ([before, after].some((range) => range.from && range.to && range.from > range.to)) {
    return 'Дата окончания периода наблюдений раньше даты начала.';
  }
  if (dateRangeSet(before) && dateRangeSet(after) && dateRangesOverlap(before, after)) {
    return 'Периоды наблюдений «до» и «после» пересекаются.';
  }
  return null;
});

const query = computed(() => ({
  measurementIds: measurementIds.value.join(','),
  scaleKeys: scaleKeys.value.join(','),
  gradesBeforePeriodId: gradesBefore.value ?? '',
  gradesAfterPeriodId: gradesAfter.value ?? '',
  observationsBeforeFrom: observationsBeforeFrom.value,
  observationsBeforeTo: observationsBeforeTo.value,
  observationsAfterFrom: observationsAfterFrom.value,
  observationsAfterTo: observationsAfterTo.value,
}));

/** Подставить в поля семестры и периоды, выбранные сервером по умолчанию, без новой загрузки. */
async function applyDefaults(outcomes: ResearchOutcomesDto): Promise<void> {
  applyingDefaults = true;
  gradesBefore.value = outcomes.gradesBefore?.id ?? null;
  gradesAfter.value = outcomes.gradesAfter?.id ?? null;
  observationsBeforeFrom.value = outcomes.observationsBefore?.from ?? '';
  observationsBeforeTo.value = outcomes.observationsBefore?.to ?? '';
  observationsAfterFrom.value = outcomes.observationsAfter?.from ?? '';
  observationsAfterTo.value = outcomes.observationsAfter?.to ?? '';
  await nextTick();
  applyingDefaults = false;
}

async function load(): Promise<void> {
  if (outcomeError.value) return;
  error.value = null;
  try {
    data.value = await api<ResearchDataDto>(`/research-projects/${props.projectId}/data`, {
      query: query.value,
    });
    if (measurementIds.value.length === 0 && scaleKeys.value.length === 0) {
      allScales.value = data.value.scales;
    }
    periods.value = data.value.outcomes.periods;
    if (outcomesEmpty()) await applyDefaults(data.value.outcomes);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить данные';
  }
}

watch([measurementIds, scaleKeys, ...outcomeRefs], () => {
  if (!applyingDefaults) void load();
});
watch(
  () => props.measurements.length,
  () => {
    measurementIds.value = [];
    scaleKeys.value = [];
    void load();
  },
);
onMounted(load);

const measurementOptions = computed(() =>
  props.measurements.map((item) => ({ value: item.id, label: item.title })),
);
const multipleQuestionnaires = computed(
  () => new Set(allScales.value.map((scale) => scale.questionnaireId)).size > 1,
);
const scaleLabel = (scale: ResearchScaleDto) =>
  multipleQuestionnaires.value
    ? `${scale.name} (${scale.questionnaireTitle})`
    : `${scale.name} (${scale.code})`;
const scaleOptions = computed(() =>
  allScales.value.map((scale) => ({ value: scale.key, label: scaleLabel(scale) })),
);

const scaleOf = (key: string) => data.value!.scales.find((scale) => scale.key === key)!;
const measurementOf = (id: string) => data.value!.measurements.find((item) => item.id === id)!;

function measurementRows(measurementId: string): StatsRow[] {
  return data
    .value!.stats.filter((row) => row.measurementId === measurementId)
    .map((row) => ({
      key: `${row.scaleKey}:${row.group}`,
      label: scaleLabel(scaleOf(row.scaleKey)),
      hint: RESEARCH_GROUP_LABELS[row.group],
      stats: row.stats,
    }));
}

function changeRows(change: ResearchDataDto['changes'][number]): StatsRow[] {
  return change.rows.map((row) => ({
    key: `${row.scaleKey}:${row.group}`,
    label: scaleLabel(scaleOf(row.scaleKey)),
    hint: RESEARCH_GROUP_LABELS[row.group],
    stats: row.stats,
  }));
}

async function download(): Promise<void> {
  exportBusy.value = true;
  exportError.value = null;
  exported.value = false;
  try {
    await apiDownload(`/research-projects/${props.projectId}/export`, {
      query: { ...query.value, format: format.value, dataset: dataset.value },
    });
    exported.value = true;
  } catch (caught) {
    exportError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось сформировать выгрузку';
  } finally {
    exportBusy.value = false;
  }
}
</script>

<template>
  <section class="iot-card research-data" aria-labelledby="research-data-title">
    <h2 id="research-data-title">Данные исследования</h2>
    <EmptyState
      v-if="measurements.length === 0"
      icon="pi pi-chart-bar"
      title="Замеров пока нет"
      description="Зафиксируйте первичный и повторный замеры — здесь появятся статистики ЭГ и КГ по шкалам диагностики."
    />
    <div v-else class="research-data__filters">
      <div class="iot-field">
        <label id="research-measurements-label" for="research-measurements">Замеры</label>
        <MultiSelect
          v-model="measurementIds"
          input-id="research-measurements"
          aria-labelledby="research-measurements-label"
          :options="measurementOptions"
          option-label="label"
          option-value="value"
          placeholder="Все замеры"
          display="chip"
          fluid
        />
      </div>
      <div class="iot-field">
        <label id="research-scales-label" for="research-scales">Шкалы</label>
        <MultiSelect
          v-model="scaleKeys"
          input-id="research-scales"
          aria-labelledby="research-scales-label"
          :options="scaleOptions"
          option-label="label"
          option-value="value"
          placeholder="Все шкалы"
          display="chip"
          fluid
        />
      </div>
    </div>

    <fieldset class="research-data__outcome-filters">
      <legend class="iot-field__label">
        Успеваемость и наблюдения на занятиях: «до» и «после»
      </legend>
      <div class="iot-field">
        <label for="research-grades-before">Семестр «до»</label>
        <Select
          v-model="gradesBefore"
          input-id="research-grades-before"
          :options="periods"
          option-label="label"
          option-value="id"
          placeholder="Не выбран"
          show-clear
          fluid
        />
      </div>
      <div class="iot-field">
        <label for="research-grades-after">Семестр «после»</label>
        <Select
          v-model="gradesAfter"
          input-id="research-grades-after"
          :options="periods"
          option-label="label"
          option-value="id"
          placeholder="Не выбран"
          show-clear
          fluid
        />
      </div>
      <div class="iot-field">
        <label for="research-observations-before-from">Наблюдения «до»: с</label>
        <DateInput
          v-model="observationsBeforeFrom"
          input-id="research-observations-before-from"
          fluid
        />
      </div>
      <div class="iot-field">
        <label for="research-observations-before-to">по</label>
        <DateInput
          v-model="observationsBeforeTo"
          input-id="research-observations-before-to"
          :invalid="!!outcomeError"
          fluid
        />
      </div>
      <div class="iot-field">
        <label for="research-observations-after-from">Наблюдения «после»: с</label>
        <DateInput
          v-model="observationsAfterFrom"
          input-id="research-observations-after-from"
          :invalid="!!outcomeError"
          fluid
        />
      </div>
      <div class="iot-field">
        <label for="research-observations-after-to">по</label>
        <DateInput v-model="observationsAfterTo" input-id="research-observations-after-to" fluid />
      </div>
      <p class="research-data__note research-data__wide">
        Семестры — только те, по которым у участников загружены оценки. По умолчанию — два последних
        семестра; период «до» — по день накануне начала исследования, «после» — с даты начала до
        окончания. Пустая граница периода — без ограничения.
      </p>
      <Message v-if="outcomeError" severity="error" role="alert" class="research-data__wide">
        {{ outcomeError }}
      </Message>
    </fieldset>

    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <template v-else>
      <div
        class="research-data__scroll"
        role="region"
        aria-label="Полные и неполные наблюдения"
        tabindex="0"
      >
        <table class="research-data__table">
          <caption>
            Наблюдения
          </caption>
          <thead>
            <tr>
              <th scope="col">Группа</th>
              <th scope="col">Участников</th>
              <th scope="col">Полных наблюдений</th>
              <th scope="col">Неполных</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.observations" :key="row.group">
              <th scope="row">{{ RESEARCH_GROUP_LABELS[row.group] }}</th>
              <td>{{ row.participants }}</td>
              <td>{{ row.complete }}</td>
              <td>{{ row.incomplete }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="research-data__note">
        Полное наблюдение — есть балл по каждой выбранной шкале в каждом выбранном замере.
        Незавершённые прохождения в расчёт не входят.
        <template v-if="data.excludedParticipants > 0">
          Исключённых участников: {{ data.excludedParticipants }} — в расчёт не входят.
        </template>
      </p>

      <article v-for="item in data.measurements" :key="item.id" class="research-data__block">
        <h3>{{ item.title }}</h3>
        <p class="research-data__note">
          {{ measurementText(item) }} · период: {{ periodText(item.startsOn, item.endsOn) }}
        </p>
        <StatsTable
          :caption="`${item.title}: описательные статистики по шкалам и группам`"
          :rows="measurementRows(item.id)"
          row-header="Шкала и группа"
        />
      </article>

      <article
        v-for="change in data.changes"
        :key="change.questionnaireId"
        class="research-data__block"
      >
        <h3>
          Изменение: {{ measurementOf(change.fromMeasurementId).title }} →
          {{ measurementOf(change.toMeasurementId).title }}
        </h3>
        <p v-if="!change.comparable" class="research-data__warning" role="status">
          <i class="pi pi-exclamation-triangle" aria-hidden="true" /> {{ change.reason }}
        </p>
        <template v-else>
          <p class="research-data__note">
            Разность баллов у участников, прошедших оба замера; без одного из замеров — в колонке
            «Пропуски».
          </p>
          <StatsTable
            :caption="'Изменение баллов между замерами по шкалам и группам'"
            :rows="changeRows(change)"
            row-header="Шкала и группа"
          />
        </template>
      </article>

      <ResearchOutcomesBlock :outcomes="data.outcomes" />

      <form
        v-if="canExport"
        class="research-data__export"
        novalidate
        aria-labelledby="research-export-title"
        @submit.prevent="download"
      >
        <h3 id="research-export-title">Экспорт</h3>
        <p class="research-data__note">
          Обезличенный файл: коды участников, группа (ЭГ или КГ), версии методик. Ф. И. О. и учётные
          данные не выгружаются; пропуск — пустая ячейка. Широкая таблица — одна строка на
          участника: шкалы «до» и «после», средний балл за выбранные семестры и средние наблюдений
          за выбранные периоды — для расчёта критериев во внешней программе.
        </p>
        <fieldset class="research-data__options">
          <legend class="iot-field__label">Набор данных</legend>
          <div
            v-for="value in Object.values(ResearchDataset)"
            :key="value"
            class="research-data__radio"
          >
            <RadioButton v-model="dataset" :input-id="`dataset-${value}`" :value="value" />
            <label :for="`dataset-${value}`">{{ RESEARCH_DATASET_LABELS[value] }}</label>
          </div>
        </fieldset>
        <fieldset class="research-data__options">
          <legend class="iot-field__label">Формат файла</legend>
          <div class="research-data__radio">
            <RadioButton v-model="format" input-id="research-format-xlsx" value="xlsx" />
            <label for="research-format-xlsx">XLSX (Excel)</label>
          </div>
          <div class="research-data__radio">
            <RadioButton v-model="format" input-id="research-format-csv" value="csv" />
            <label for="research-format-csv">CSV (UTF-8, «;»)</label>
          </div>
        </fieldset>
        <div>
          <Button
            type="submit"
            label="Экспортировать"
            icon="pi pi-download"
            :loading="exportBusy"
          />
        </div>
        <Message v-if="exportError" severity="error" role="alert">{{ exportError }}</Message>
        <Message v-if="exported" severity="success" role="status">
          Файл сформирован. Выгрузка записана в журнал аудита.
        </Message>
      </form>
    </template>
  </section>
</template>

<style scoped>
.research-data {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  min-width: 0;
}

.research-data h2,
.research-data h3 {
  margin: 0;
}

.research-data h3 {
  font-size: 1rem;
}

.research-data__filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--iot-space-3);
}

.research-data__outcome-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.research-data__outcome-filters legend {
  margin-bottom: var(--iot-space-2);
}

.research-data__wide {
  grid-column: 1 / -1;
}

.research-data__note {
  margin: 0;
  color: var(--iot-color-muted);
}

.research-data__warning {
  margin: 0;
  color: var(--iot-tone-warning-text);
}

.research-data__block,
.research-data__export {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding-top: var(--iot-space-3);
  border-top: 1px solid var(--iot-color-border);
}

.research-data__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
  padding: 0;
  border: 0;
}

.research-data__options legend {
  width: 100%;
  margin-bottom: var(--iot-space-1);
}

.research-data__radio {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.research-data__scroll {
  /* Скрытая подпись таблицы позиционируется внутри контейнера, а не страницы (NFR-004). */
  position: relative;
  overflow-x: auto;
  max-width: 100%;
}

.research-data__table {
  width: 100%;
  border-collapse: collapse;
}

.research-data__table caption {
  text-align: left;
  font-weight: 600;
  padding-bottom: var(--iot-space-2);
}

.research-data__table th,
.research-data__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: right;
}

.research-data__table th[scope='row'],
.research-data__table thead th:first-child {
  text-align: left;
}

.research-data__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

@media (max-width: 599px) {
  .research-data__filters,
  .research-data__outcome-filters {
    grid-template-columns: 1fr;
  }
}
</style>
