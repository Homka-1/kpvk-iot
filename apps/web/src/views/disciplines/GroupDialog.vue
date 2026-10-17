<script setup lang="ts">
import { type GroupDto, groupFormSchema } from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { useForm } from 'vee-validate';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';

/** Создание и изменение учебной группы (название, курс, специальность). */
const props = defineProps<{ group: GroupDto | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [] }>();

const { defineField, errors, handleSubmit, isSubmitting, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(groupFormSchema),
});
const [name, nameAttrs] = defineField('name');
const [course] = defineField('course');
const [specialty, specialtyAttrs] = defineField('specialty');
const serverError = ref<string | null>(null);

watch(visible, (open) => {
  if (!open) return;
  serverError.value = null;
  resetForm({
    values: props.group
      ? { name: props.group.name, course: props.group.course, specialty: props.group.specialty }
      : { name: '', course: 1, specialty: '' },
  });
});

const onSubmit = handleSubmit(async (values) => {
  serverError.value = null;
  try {
    await api(props.group ? `/groups/${props.group.id}` : '/groups', {
      method: props.group ? 'PATCH' : 'POST',
      body: values,
    });
    emit('saved');
    visible.value = false;
  } catch (error) {
    if (error instanceof ApiError) setErrors(error.fields);
    serverError.value = error instanceof ApiError ? error.message : 'Не удалось сохранить группу';
  }
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="group ? 'Изменение группы' : 'Новая группа'"
    :style="{ width: '28rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit="onSubmit">
      <div class="iot-field">
        <label for="group-name">Название</label>
        <InputText
          id="group-name"
          v-model="name"
          v-bind="nameAttrs"
          :invalid="!!errors.name"
          fluid
        />
        <small v-if="errors.name" class="iot-field-error">{{ errors.name }}</small>
      </div>
      <div class="iot-field">
        <label for="group-course">Курс</label>
        <InputNumber
          v-model="course"
          input-id="group-course"
          :min="1"
          :max="6"
          show-buttons
          :invalid="!!errors.course"
          fluid
        />
        <small v-if="errors.course" class="iot-field-error">{{ errors.course }}</small>
      </div>
      <div class="iot-field">
        <label for="group-specialty">Специальность</label>
        <InputText
          id="group-specialty"
          v-model="specialty"
          v-bind="specialtyAttrs"
          :invalid="!!errors.specialty"
          fluid
        />
        <small v-if="errors.specialty" class="iot-field-error">{{ errors.specialty }}</small>
      </div>
      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" :loading="isSubmitting" />
      </div>
    </form>
  </Dialog>
</template>
