<script setup lang="ts">
import {
  type ComparabilityQuestionnaireDto,
  MEASUREMENT_TYPE_LABELS,
  MeasurementType,
  RESEARCH_TITLE_MAX,
  type ResearchProjectDetailDto,
  researchMeasurementFormSchema,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import { issuesToErrors } from '@/views/library/form';

/**
 * Фиксация замера исследования (FR-072): опубликованная версия методики, тип замера и период.
 * К замеру относятся завершённые прохождения участников по этой версии и типу в этом периоде.
 */
const props = defineProps<{ projectId: string }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [project: ResearchProjectDetailDto] }>();

const questionnaires = ref<ComparabilityQuestionnaireDto[]>([]);
const form = reactive({
  versionId: null as string | null,
  measurementType: MeasurementType.PRIMARY as MeasurementType,
  title: '',
  startsOn: '',
  endsOn: '',
});
const errors = ref<Record<string, string>>({});
const serverError = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

const versionOptions = computed(() =>
  questionnaires.value.flatMap((questionnaire) =>
    questionnaire.versions.map((version) => ({
      value: version.id,
      label: `${version.title}, версия ${version.versionNumber}${
        version.status === 'PUBLISHED' ? ' (действующая)' : ''
      }${questionnaire.isDemo ? ' — демо' : ''}`,
    })),
  ),
);
const typeOptions = Object.values(MeasurementType).map((value) => ({
  value,
  label: MEASUREMENT_TYPE_LABELS[value],
}));

watch(visible, async (open) => {
  if (!open) return;
  Object.assign(form, {
    versionId: null,
    measurementType: MeasurementType.PRIMARY,
    title: '',
    startsOn: '',
    endsOn: '',
  });
  errors.value = {};
  serverError.value = null;
  idempotencyKey = newIdempotencyKey();
  try {
    questionnaires.value = await api<ComparabilityQuestionnaireDto[]>(
      '/questionnaire-comparabilities',
    );
  } catch (caught) {
    serverError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось загрузить методики';
  }
});

async function save(): Promise<void> {
  serverError.value = null;
  const parsed = researchMeasurementFormSchema.safeParse({
    ...form,
    versionId: form.versionId ?? '',
    startsOn: form.startsOn || null,
    endsOn: form.endsOn || null,
  });
  errors.value = parsed.success ? {} : issuesToErrors(parsed.error.issues);
  if (!parsed.success) return;
  busy.value = true;
  try {
    const project = await api<ResearchProjectDetailDto>(
      `/research-projects/${props.projectId}/measurements`,
      { method: 'POST', body: parsed.data, headers: { 'Idempotency-Key': idempotencyKey } },
    );
    visible.value = false;
    emit('saved', project);
  } catch (caught) {
    if (caught instanceof ApiError) errors.value = caught.fields;
    serverError.value = caught instanceof ApiError ? caught.message : 'Не удалось сохранить замер';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Новый замер"
    :style="{ width: '34rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <div class="iot-field">
        <label for="measurement-title">Название замера</label>
        <InputText
          id="measurement-title"
          v-model="form.title"
          :maxlength="RESEARCH_TITLE_MAX"
          placeholder="Например, входной замер"
          :invalid="!!errors.title"
          fluid
        />
        <small v-if="errors.title" class="iot-field-error">{{ errors.title }}</small>
      </div>
      <div class="iot-field">
        <label id="measurement-version-label" for="measurement-version">Версия методики</label>
        <Select
          v-model="form.versionId"
          input-id="measurement-version"
          aria-labelledby="measurement-version-label"
          :options="versionOptions"
          option-label="label"
          option-value="value"
          placeholder="Выберите версию"
          :invalid="!!errors.versionId"
          fluid
        />
        <small v-if="errors.versionId" class="iot-field-error">{{ errors.versionId }}</small>
      </div>
      <div class="iot-field">
        <label id="measurement-type-label" for="measurement-type">Тип замера</label>
        <Select
          v-model="form.measurementType"
          input-id="measurement-type"
          aria-labelledby="measurement-type-label"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <div class="measurement-dialog__dates">
        <div class="iot-field">
          <label for="measurement-starts">Начало периода</label>
          <DateInput
            v-model="form.startsOn"
            input-id="measurement-starts"
            :invalid="!!errors.startsOn"
            fluid
          />
          <small v-if="errors.startsOn" class="iot-field-error">{{ errors.startsOn }}</small>
        </div>
        <div class="iot-field">
          <label for="measurement-ends">Конец периода</label>
          <DateInput
            v-model="form.endsOn"
            input-id="measurement-ends"
            :invalid="!!errors.endsOn"
            fluid
          />
          <small v-if="errors.endsOn" class="iot-field-error">{{ errors.endsOn }}</small>
        </div>
      </div>
      <small class="iot-field-hint">
        Даты необязательны. В замер попадают завершённые прохождения этой версии и этого типа
        замера, пройденные в периоде.
      </small>
      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" icon="pi pi-check" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.measurement-dialog__dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--iot-space-3);
}

@media (max-width: 479px) {
  .measurement-dialog__dates {
    grid-template-columns: 1fr;
  }
}
</style>
