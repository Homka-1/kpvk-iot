<script setup lang="ts">
import {
  type GroupDto,
  PARTICIPANT_CODE_HINT,
  type StudentCreatedDto,
  studentFormSchema,
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
import TemporaryPassword from '@/components/TemporaryPassword.vue';

/**
 * Добавление студента вручную (FR-006): карточка, учётная запись и запись о группе.
 * Ключ формы защищает от двойной отправки (NFR-006).
 */
const props = defineProps<{ groups: GroupDto[]; defaultGroupId: string | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [] }>();

const { defineField, errors, handleSubmit, isSubmitting, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(studentFormSchema),
});
const [lastName, lastNameAttrs] = defineField('lastName');
const [firstName, firstNameAttrs] = defineField('firstName');
const [middleName, middleNameAttrs] = defineField('middleName');
const [groupId] = defineField('groupId');
const [participantCode, participantCodeAttrs] = defineField('participantCode');
const serverError = ref<string | null>(null);
const result = ref<StudentCreatedDto | null>(null);
let idempotencyKey = newIdempotencyKey();

watch(visible, (open) => {
  if (!open) return;
  resetForm({
    values: {
      lastName: '',
      firstName: '',
      middleName: '',
      groupId: props.defaultGroupId ?? '',
      participantCode: '',
    },
  });
  serverError.value = null;
  result.value = null;
  idempotencyKey = newIdempotencyKey();
});

const onSubmit = handleSubmit(async (values) => {
  serverError.value = null;
  try {
    result.value = await api<StudentCreatedDto>('/students', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        ...values,
        middleName: values.middleName || null,
        participantCode: values.participantCode || null,
      },
    });
    emit('created');
  } catch (error) {
    if (error instanceof ApiError && Object.keys(error.fields).length > 0) setErrors(error.fields);
    serverError.value = error instanceof ApiError ? error.message : 'Не удалось добавить студента';
  }
});

const nameFields = [
  { id: 'lastName', label: 'Фамилия', model: lastName, attrs: lastNameAttrs },
  { id: 'firstName', label: 'Имя', model: firstName, attrs: firstNameAttrs },
  { id: 'middleName', label: 'Отчество (если есть)', model: middleName, attrs: middleNameAttrs },
] as const;
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Новый студент"
    :style="{ width: '32rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <div v-if="result" class="iot-form">
      <p>
        Студент добавлен. Код участника: <strong>{{ result.student.participantCode }}</strong
        >, логин: <strong>{{ result.login }}</strong
        >.
      </p>
      <TemporaryPassword v-if="result.temporaryPassword" :password="result.temporaryPassword" />
      <Message v-else severity="info">
        Пароль уже был показан при первой отправке формы. При необходимости выдайте новый в карточке
        студента.
      </Message>
      <div class="iot-form-buttons">
        <Button label="Готово" @click="visible = false" />
      </div>
    </div>
    <form v-else class="iot-form" novalidate @submit="onSubmit">
      <div v-for="field in nameFields" :key="field.id" class="iot-field">
        <label :for="`new-student-${field.id}`">{{ field.label }}</label>
        <InputText
          :id="`new-student-${field.id}`"
          v-model="field.model.value"
          v-bind="field.attrs.value"
          autocomplete="off"
          :invalid="!!errors[field.id]"
          :aria-describedby="`new-student-${field.id}-error`"
          fluid
        />
        <small
          v-if="errors[field.id]"
          :id="`new-student-${field.id}-error`"
          class="iot-field-error"
        >
          {{ errors[field.id] }}
        </small>
      </div>
      <div class="iot-field">
        <label for="new-student-group">Группа</label>
        <Select
          v-model="groupId"
          input-id="new-student-group"
          :options="groups"
          option-label="name"
          option-value="id"
          placeholder="Выберите группу"
          empty-message="Нет доступных групп"
          :invalid="!!errors.groupId"
          aria-describedby="new-student-group-error"
          fluid
        />
        <small v-if="errors.groupId" id="new-student-group-error" class="iot-field-error">
          {{ errors.groupId }}
        </small>
      </div>
      <div class="iot-field">
        <label for="new-student-code">Код участника (необязательно)</label>
        <InputText
          id="new-student-code"
          v-model="participantCode"
          v-bind="participantCodeAttrs"
          autocomplete="off"
          :invalid="!!errors.participantCode"
          aria-describedby="new-student-code-hint new-student-code-error"
          fluid
        />
        <small id="new-student-code-hint" class="iot-field-hint">
          Если не указан, код сформируется автоматически. {{ PARTICIPANT_CODE_HINT }}. Логин
          студента совпадает с кодом в нижнем регистре.
        </small>
        <small v-if="errors.participantCode" id="new-student-code-error" class="iot-field-error">
          {{ errors.participantCode }}
        </small>
      </div>
      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Добавить" icon="pi pi-user-plus" :loading="isSubmitting" />
      </div>
    </form>
  </Dialog>
</template>
