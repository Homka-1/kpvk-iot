<script setup lang="ts">
import {
  type FileDto,
  MATERIAL_KIND_LABELS,
  MaterialKind,
  type MaterialDto,
  materialFormSchema,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Textarea from 'primevue/textarea';
import { reactive, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import { useContextStore } from '@/stores/context';
import FileUploadButton from './FileUploadButton.vue';
import { fileLabel } from './files';
import { issuesToErrors } from './form';

/** Создание и изменение материала библиотеки: файл, ссылка или текст. */
const props = defineProps<{ material: MaterialDto | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [] }>();
const context = useContextStore();

const kindOptions = Object.values(MaterialKind).map((value) => ({
  value,
  label: MATERIAL_KIND_LABELS[value],
}));
const form = reactive({
  title: '',
  description: '',
  kind: MaterialKind.FILE as MaterialKind,
  file: null as FileDto | null,
  url: '',
  body: '',
  disciplineId: null as string | null,
  topic: '',
});
const errors = ref<Record<string, string>>({});
const serverError = ref<string | null>(null);
const saving = ref(false);
let idempotencyKey = newIdempotencyKey();

watch(visible, (open) => {
  if (!open) return;
  const material = props.material;
  Object.assign(form, {
    title: material?.title ?? '',
    description: material?.description ?? '',
    kind: material?.kind ?? MaterialKind.FILE,
    file: material?.file ?? null,
    url: material?.url ?? '',
    body: material?.body ?? '',
    disciplineId: material?.discipline?.id ?? context.disciplineId,
    topic: material?.topic ?? '',
  });
  errors.value = {};
  serverError.value = null;
  idempotencyKey = newIdempotencyKey();
});

async function save(): Promise<void> {
  serverError.value = null;
  const parsed = materialFormSchema.safeParse({
    title: form.title,
    description: form.description,
    kind: form.kind,
    fileId: form.file?.id ?? null,
    url: form.url,
    body: form.body,
    disciplineId: form.disciplineId,
    topic: form.topic,
  });
  errors.value = parsed.success ? {} : issuesToErrors(parsed.error.issues);
  if (!parsed.success) return;
  saving.value = true;
  try {
    const material = props.material;
    await api(material ? `/materials/${material.id}` : '/materials', {
      method: material ? 'PUT' : 'POST',
      body: parsed.data,
      headers: material ? undefined : { 'Idempotency-Key': idempotencyKey },
    });
    emit('saved');
    visible.value = false;
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fields;
    serverError.value = error instanceof ApiError ? error.message : 'Не удалось сохранить материал';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="material ? 'Изменение материала' : 'Новый материал'"
    :style="{ width: '40rem' }"
    :breakpoints="{ '640px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <div class="iot-field">
        <label for="material-title">Название</label>
        <InputText id="material-title" v-model="form.title" :invalid="!!errors.title" fluid />
        <small v-if="errors.title" class="iot-field-error">{{ errors.title }}</small>
      </div>
      <div class="iot-field">
        <span id="material-kind-label" class="iot-field__label">Вид материала</span>
        <SelectButton
          v-model="form.kind"
          :options="kindOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-labelledby="material-kind-label"
        />
      </div>

      <div v-if="form.kind === MaterialKind.FILE" class="iot-field">
        <span class="iot-field__label">Файл</span>
        <p v-if="form.file" class="material-dialog__file">
          <i class="pi pi-file" aria-hidden="true" />
          {{ fileLabel(form.file) }}
        </p>
        <FileUploadButton
          :label="form.file ? 'Заменить файл' : 'Выбрать файл'"
          :invalid="!!errors.fileId"
          @uploaded="form.file = $event"
        />
        <small v-if="errors.fileId" class="iot-field-error">{{ errors.fileId }}</small>
      </div>
      <div v-else-if="form.kind === MaterialKind.LINK" class="iot-field">
        <label for="material-url">Ссылка</label>
        <InputText
          id="material-url"
          v-model="form.url"
          type="url"
          placeholder="Адрес, начинается с https"
          :invalid="!!errors.url"
          fluid
        />
        <small v-if="errors.url" class="iot-field-error">{{ errors.url }}</small>
      </div>
      <div v-else class="iot-field">
        <label for="material-body">Текст</label>
        <Textarea id="material-body" v-model="form.body" rows="8" :invalid="!!errors.body" fluid />
        <small v-if="errors.body" class="iot-field-error">{{ errors.body }}</small>
      </div>

      <div class="material-dialog__row">
        <div class="iot-field">
          <label id="material-discipline-label" for="material-discipline">Дисциплина</label>
          <Select
            v-model="form.disciplineId"
            input-id="material-discipline"
            aria-labelledby="material-discipline-label"
            :options="context.disciplines"
            option-label="name"
            option-value="id"
            placeholder="Общий материал"
            show-clear
            :invalid="!!errors.disciplineId"
            fluid
          />
          <small v-if="errors.disciplineId" class="iot-field-error">{{
            errors.disciplineId
          }}</small>
        </div>
        <div class="iot-field">
          <label for="material-topic">Тема (если есть)</label>
          <InputText id="material-topic" v-model="form.topic" :invalid="!!errors.topic" fluid />
          <small v-if="errors.topic" class="iot-field-error">{{ errors.topic }}</small>
        </div>
      </div>
      <div class="iot-field">
        <label for="material-description">Описание (если нужно)</label>
        <Textarea
          id="material-description"
          v-model="form.description"
          rows="3"
          :invalid="!!errors.description"
          fluid
        />
        <small v-if="errors.description" class="iot-field-error">{{ errors.description }}</small>
      </div>
      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" :loading="saving" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.material-dialog__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: var(--iot-space-3);
}

.material-dialog__file {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
