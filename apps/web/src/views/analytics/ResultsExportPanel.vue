<script setup lang="ts">
import {
  type ComparabilityQuestionnaireDto,
  DiagnosticExportFormat,
  MEASUREMENT_TYPE_LABELS,
  MeasurementType,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import { ref } from 'vue';
import { apiDownload, ApiError } from '@/api/http';

/**
 * Обезличенная выгрузка результатов диагностики (FR-025): код участника вместо ФИО, версия
 * методики, тип замера, баллы по шкалам. Пропуски — пустые ячейки, не нули (FR-074).
 */
const props = defineProps<{ questionnaires: ComparabilityQuestionnaireDto[] }>();

const questionnaireId = ref<string | null>(props.questionnaires[0]?.id ?? null);
const measurementType = ref<MeasurementType | null>(null);
const format = ref<DiagnosticExportFormat>(DiagnosticExportFormat.XLSX);
const busy = ref(false);
const error = ref<string | null>(null);
const done = ref(false);

const measurementOptions = [
  { value: null, label: 'Все замеры' },
  ...Object.values(MeasurementType).map((value) => ({
    value,
    label: MEASUREMENT_TYPE_LABELS[value],
  })),
];

async function download(): Promise<void> {
  if (!questionnaireId.value) {
    error.value = 'Выберите методику';
    return;
  }
  busy.value = true;
  error.value = null;
  done.value = false;
  try {
    await apiDownload('/diagnostic-results/export', {
      query: {
        questionnaireId: questionnaireId.value,
        format: format.value,
        measurementType: measurementType.value,
      },
    });
    done.value = true;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось сформировать выгрузку';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="iot-card export" aria-labelledby="export-title">
    <h2 id="export-title" class="export__title">Выгрузка результатов диагностики</h2>
    <p class="export__hint">
      Обезличенные данные: код участника вместо ФИО, группа, версия методики, тип замера, баллы,
      уровни и число пропущенных ответов по шкалам. Нет балла — пустая ячейка, не ноль. Выгрузка
      записывается в журнал аудита.
    </p>
    <form class="iot-form" novalidate @submit.prevent="download">
      <div class="export__fields">
        <div class="iot-field">
          <label id="export-questionnaire-label" for="export-questionnaire">Методика</label>
          <Select
            v-model="questionnaireId"
            input-id="export-questionnaire"
            aria-labelledby="export-questionnaire-label"
            :options="questionnaires"
            option-label="title"
            option-value="id"
            placeholder="Выберите методику"
            fluid
          />
        </div>
        <div class="iot-field">
          <label id="export-measurement-label" for="export-measurement">Замеры</label>
          <Select
            v-model="measurementType"
            input-id="export-measurement"
            aria-labelledby="export-measurement-label"
            :options="measurementOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
      </div>
      <fieldset class="export__format">
        <legend>Формат файла</legend>
        <div class="export__choice">
          <RadioButton v-model="format" input-id="export-xlsx" value="xlsx" />
          <label for="export-xlsx">XLSX (Excel)</label>
        </div>
        <div class="export__choice">
          <RadioButton v-model="format" input-id="export-csv" value="csv" />
          <label for="export-csv">CSV (UTF-8, разделитель «;»)</label>
        </div>
      </fieldset>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <Message v-else-if="done" severity="success" role="status">Файл сформирован.</Message>
      <div class="iot-form-buttons">
        <Button type="submit" label="Выгрузить" icon="pi pi-download" :loading="busy" />
      </div>
    </form>
  </section>
</template>

<style scoped>
.export {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.export__title {
  margin: 0;
  font-size: 1.125rem;
}

.export__hint {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.export__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: var(--iot-space-3);
}

.export__format {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-5);
  margin: 0;
  padding: 0;
  border: 0;
}

.export__format legend {
  margin-bottom: var(--iot-space-1);
  font-weight: 600;
}

.export__choice {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}
</style>
