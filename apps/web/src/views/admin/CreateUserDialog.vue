<script setup lang="ts">
import { ROLE_LABELS, STAFF_ROLES, userFormSchema } from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { useForm } from 'vee-validate';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import TemporaryPassword from './TemporaryPassword.vue';
import type { TemporaryPasswordResult } from './types';

/** Создание учётной записи сотрудника. Студенты добавляются в разделе «Студенты». */
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [result: TemporaryPasswordResult] }>();

const { defineField, errors, handleSubmit, isSubmitting, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(userFormSchema),
  initialValues: { login: '', lastName: '', firstName: '', middleName: '', email: '', roles: [] },
});
const [login, loginAttrs] = defineField('login');
const [lastName, lastNameAttrs] = defineField('lastName');
const [firstName, firstNameAttrs] = defineField('firstName');
const [middleName, middleNameAttrs] = defineField('middleName');
const [email, emailAttrs] = defineField('email');
const [roles] = defineField('roles');
const serverError = ref<string | null>(null);
const result = ref<TemporaryPasswordResult | null>(null);

watch(visible, (open) => {
  if (open) {
    resetForm();
    serverError.value = null;
    result.value = null;
  }
});

const onSubmit = handleSubmit(async (values) => {
  serverError.value = null;
  try {
    result.value = await api<TemporaryPasswordResult>('/admin/users', {
      method: 'POST',
      body: { ...values, middleName: values.middleName || null, email: values.email || null },
    });
    emit('created', result.value);
  } catch (error) {
    if (error instanceof ApiError && Object.keys(error.fields).length > 0) setErrors(error.fields);
    serverError.value =
      error instanceof ApiError ? error.message : 'Не удалось создать учётную запись';
  }
});

const fields = [
  { id: 'login', label: 'Логин', model: login, attrs: loginAttrs, autocomplete: 'off' },
  { id: 'lastName', label: 'Фамилия', model: lastName, attrs: lastNameAttrs, autocomplete: 'off' },
  { id: 'firstName', label: 'Имя', model: firstName, attrs: firstNameAttrs, autocomplete: 'off' },
  {
    id: 'middleName',
    label: 'Отчество (если есть)',
    model: middleName,
    attrs: middleNameAttrs,
    autocomplete: 'off',
  },
  { id: 'email', label: 'Электронная почта', model: email, attrs: emailAttrs, autocomplete: 'off' },
] as const;
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Новый сотрудник"
    :style="{ width: '32rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <div v-if="result" class="create-user">
      <p>
        Учётная запись <strong>{{ result.user.login }}</strong> создана.
      </p>
      <TemporaryPassword :password="result.temporaryPassword" />
      <div class="create-user__buttons">
        <Button label="Готово" @click="visible = false" />
      </div>
    </div>
    <form v-else class="create-user" novalidate @submit="onSubmit">
      <div v-for="field in fields" :key="field.id" class="create-user__field">
        <label :for="`new-user-${field.id}`">{{ field.label }}</label>
        <InputText
          :id="`new-user-${field.id}`"
          v-model="field.model.value"
          v-bind="field.attrs.value"
          :autocomplete="field.autocomplete"
          :invalid="!!errors[field.id]"
          :aria-describedby="`new-user-${field.id}-error`"
          fluid
        />
        <small
          v-if="errors[field.id]"
          :id="`new-user-${field.id}-error`"
          class="create-user__error"
        >
          {{ errors[field.id] }}
        </small>
      </div>
      <fieldset class="create-user__roles">
        <legend>Роли</legend>
        <div v-for="role in STAFF_ROLES" :key="role" class="create-user__role">
          <Checkbox v-model="roles" :input-id="`new-user-role-${role}`" :value="role" />
          <label :for="`new-user-role-${role}`">{{ ROLE_LABELS[role] }}</label>
        </div>
        <small v-if="errors.roles" class="create-user__error">{{ errors.roles }}</small>
      </fieldset>
      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <div class="create-user__buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Создать" icon="pi pi-user-plus" :loading="isSubmitting" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.create-user {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.create-user p {
  margin: 0;
}

.create-user__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.create-user__field label,
.create-user__roles legend {
  font-weight: 600;
}

.create-user__roles {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.create-user__role {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.create-user__error {
  color: var(--iot-tone-danger-text);
}

.create-user__buttons {
  display: flex;
  justify-content: flex-end;
  gap: var(--iot-space-2);
}
</style>
