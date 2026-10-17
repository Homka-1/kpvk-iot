<script setup lang="ts">
import { type DisciplineDto, disciplineFormSchema } from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { useForm } from 'vee-validate';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';

/** Создание и изменение дисциплины. */
const props = defineProps<{ discipline: DisciplineDto | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [] }>();

const { defineField, errors, handleSubmit, isSubmitting, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(disciplineFormSchema),
});
const [name, nameAttrs] = defineField('name');
const [code, codeAttrs] = defineField('code');
const [description, descriptionAttrs] = defineField('description');
const serverError = ref<string | null>(null);

watch(visible, (open) => {
  if (!open) return;
  serverError.value = null;
  resetForm({
    values: {
      name: props.discipline?.name ?? '',
      code: props.discipline?.code ?? '',
      description: props.discipline?.description ?? '',
    },
  });
});

const onSubmit = handleSubmit(async (values) => {
  serverError.value = null;
  try {
    await api(props.discipline ? `/disciplines/${props.discipline.id}` : '/disciplines', {
      method: props.discipline ? 'PATCH' : 'POST',
      body: {
        name: values.name,
        code: values.code || null,
        description: values.description || null,
      },
    });
    emit('saved');
    visible.value = false;
  } catch (error) {
    if (error instanceof ApiError) setErrors(error.fields);
    serverError.value =
      error instanceof ApiError ? error.message : 'Не удалось сохранить дисциплину';
  }
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="discipline ? 'Изменение дисциплины' : 'Новая дисциплина'"
    :style="{ width: '32rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit="onSubmit">
      <div class="iot-field">
        <label for="discipline-name">Название</label>
        <InputText
          id="discipline-name"
          v-model="name"
          v-bind="nameAttrs"
          :invalid="!!errors.name"
          fluid
        />
        <small v-if="errors.name" class="iot-field-error">{{ errors.name }}</small>
      </div>
      <div class="iot-field">
        <label for="discipline-code">Код (если есть)</label>
        <InputText
          id="discipline-code"
          v-model="code"
          v-bind="codeAttrs"
          :invalid="!!errors.code"
          fluid
        />
        <small v-if="errors.code" class="iot-field-error">{{ errors.code }}</small>
      </div>
      <div class="iot-field">
        <label for="discipline-description">Описание (если нужно)</label>
        <Textarea
          id="discipline-description"
          v-model="description"
          v-bind="descriptionAttrs"
          rows="3"
          :invalid="!!errors.description"
          fluid
        />
        <small v-if="errors.description" class="iot-field-error">{{ errors.description }}</small>
      </div>
      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" :loading="isSubmitting" />
      </div>
    </form>
  </Dialog>
</template>
