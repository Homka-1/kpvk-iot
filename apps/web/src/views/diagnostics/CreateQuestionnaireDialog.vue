<script setup lang="ts">
import {
  type DiagnosticDirectionDto,
  emptyQuestionnaireContent,
  type QuestionnaireDetailDto,
  questionnaireCreateFormSchema,
} from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { useForm } from 'vee-validate';
import { ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';

/** Мастер создания методики: название и направление; остальное заполняется в конструкторе. */
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [id: string] }>();

const { defineField, errors, handleSubmit, isSubmitting, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(questionnaireCreateFormSchema),
});
const [title, titleAttrs] = defineField('title');
const [directionId] = defineField('directionId');
const directions = ref<DiagnosticDirectionDto[]>([]);
const serverError = ref<string | null>(null);
let idempotencyKey = newIdempotencyKey();

watch(visible, async (open) => {
  if (!open) return;
  serverError.value = null;
  idempotencyKey = newIdempotencyKey();
  resetForm({ values: { title: '', directionId: null } });
  try {
    directions.value = await api<DiagnosticDirectionDto[]>('/diagnostic-directions');
  } catch {
    directions.value = [];
  }
});

const onSubmit = handleSubmit(async (values) => {
  serverError.value = null;
  try {
    const created = await api<QuestionnaireDetailDto>('/questionnaires', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        directionId: values.directionId ?? null,
        content: emptyQuestionnaireContent(values.title),
      },
    });
    visible.value = false;
    emit('created', created.id);
  } catch (error) {
    if (error instanceof ApiError) {
      setErrors({ title: error.fields['content.title'] ?? error.fields.title });
    }
    serverError.value = error instanceof ApiError ? error.message : 'Не удалось создать методику';
  }
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Новая методика"
    :style="{ width: '32rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit="onSubmit">
      <div class="iot-field">
        <label for="questionnaire-title">Название</label>
        <InputText
          id="questionnaire-title"
          v-model="title"
          v-bind="titleAttrs"
          :invalid="!!errors.title"
          fluid
        />
        <small v-if="errors.title" class="iot-field-error">{{ errors.title }}</small>
      </div>
      <div class="iot-field">
        <label for="questionnaire-direction">Диагностическое направление</label>
        <Select
          v-model="directionId"
          input-id="questionnaire-direction"
          :options="directions"
          option-label="name"
          option-value="id"
          placeholder="Не указано"
          show-clear
          fluid
        />
      </div>
      <p class="iot-field-hint">
        Создаётся черновик версии 1. Вопросы, шкалы, ключи и интерпретацию заполните в конструкторе,
        затем опубликуйте версию.
      </p>
      <Message v-if="serverError" severity="error" :closable="false">{{ serverError }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Создать" :loading="isSubmitting" />
      </div>
    </form>
  </Dialog>
</template>
