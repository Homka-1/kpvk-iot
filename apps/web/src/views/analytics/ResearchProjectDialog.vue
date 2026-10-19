<script setup lang="ts">
import {
  RESEARCH_DESCRIPTION_MAX,
  RESEARCH_TITLE_MAX,
  type ResearchProjectDetailDto,
  researchProjectFormSchema,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { reactive, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import { issuesToErrors } from '@/views/library/form';

/** Паспорт исследования: создание или изменение (п. 4.10). */
const props = withDefaults(defineProps<{ project?: ResearchProjectDetailDto | null }>(), {
  project: null,
});
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [project: ResearchProjectDetailDto] }>();

const form = reactive({
  title: '',
  description: '',
  startsOn: '',
  endsOn: '',
});
const errors = ref<Record<string, string>>({});
const serverError = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

watch(visible, (open) => {
  if (!open) return;
  form.title = props.project?.title ?? '';
  form.description = props.project?.description ?? '';
  form.startsOn = props.project?.startsOn ?? '';
  form.endsOn = props.project?.endsOn ?? '';
  errors.value = {};
  serverError.value = null;
  idempotencyKey = newIdempotencyKey();
});

async function save(): Promise<void> {
  serverError.value = null;
  const parsed = researchProjectFormSchema.safeParse({
    title: form.title,
    description: form.description.trim() || null,
    startsOn: form.startsOn || null,
    endsOn: form.endsOn || null,
  });
  errors.value = parsed.success ? {} : issuesToErrors(parsed.error.issues);
  if (!parsed.success) return;
  busy.value = true;
  try {
    const saved = await api<ResearchProjectDetailDto>(
      props.project ? `/research-projects/${props.project.id}` : '/research-projects',
      {
        method: props.project ? 'PATCH' : 'POST',
        body: parsed.data,
        headers: props.project ? undefined : { 'Idempotency-Key': idempotencyKey },
      },
    );
    visible.value = false;
    emit('saved', saved);
  } catch (caught) {
    if (caught instanceof ApiError) errors.value = caught.fields;
    serverError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось сохранить исследование';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="project ? 'Паспорт исследования' : 'Новое исследование'"
    :style="{ width: '34rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <div class="iot-field">
        <label for="research-title">Название</label>
        <InputText
          id="research-title"
          v-model="form.title"
          :maxlength="RESEARCH_TITLE_MAX"
          :invalid="!!errors.title"
          fluid
        />
        <small v-if="errors.title" class="iot-field-error">{{ errors.title }}</small>
      </div>
      <div class="iot-field">
        <label for="research-description">Описание (необязательно)</label>
        <Textarea
          id="research-description"
          v-model="form.description"
          rows="3"
          :maxlength="RESEARCH_DESCRIPTION_MAX"
          fluid
        />
        <small v-if="errors.description" class="iot-field-error">{{ errors.description }}</small>
      </div>
      <div class="research-dialog__dates">
        <div class="iot-field">
          <label for="research-starts">Начало (необязательно)</label>
          <DateInput
            v-model="form.startsOn"
            input-id="research-starts"
            :invalid="!!errors.startsOn"
            fluid
          />
          <small v-if="errors.startsOn" class="iot-field-error">{{ errors.startsOn }}</small>
        </div>
        <div class="iot-field">
          <label for="research-ends">Окончание (необязательно)</label>
          <DateInput
            v-model="form.endsOn"
            input-id="research-ends"
            :invalid="!!errors.endsOn"
            fluid
          />
          <small v-if="errors.endsOn" class="iot-field-error">{{ errors.endsOn }}</small>
        </div>
      </div>
      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" icon="pi pi-check" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.research-dialog__dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--iot-space-3);
}

@media (max-width: 479px) {
  .research-dialog__dates {
    grid-template-columns: 1fr;
  }
}
</style>
