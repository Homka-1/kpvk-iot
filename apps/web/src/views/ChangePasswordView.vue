<script setup lang="ts">
import { changePasswordFormSchema } from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { useForm } from 'vee-validate';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import { homePath } from '@/router/paths';
import { useAuthStore } from '@/stores/auth';

/**
 * Смена собственного пароля. Обязательна после входа с временным паролем: до смены
 * остальные разделы недоступны (проверяется и на сервере).
 */
const auth = useAuthStore();
const router = useRouter();
const mandatory = ref(auth.user?.mustChangePassword ?? false);
const minLength = ref(10);
const done = ref(false);
const serverError = ref<string | null>(null);

onMounted(async () => {
  try {
    minLength.value = (await api<{ minLength: number }>('/auth/password-policy')).minLength;
  } catch {
    // Требования проверит сервер; в форме остаётся значение по умолчанию.
  }
});

const { defineField, errors, handleSubmit, isSubmitting, setErrors, resetForm } = useForm({
  validationSchema: computed(() => toTypedSchema(changePasswordFormSchema(minLength.value))),
  initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
});
const [currentPassword, currentAttrs] = defineField('currentPassword');
const [newPassword, newAttrs] = defineField('newPassword');
const [confirmPassword, confirmAttrs] = defineField('confirmPassword');

const onSubmit = handleSubmit(async (values) => {
  serverError.value = null;
  try {
    await auth.changePassword(values.currentPassword, values.newPassword);
  } catch (error) {
    if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
      setErrors(error.fields);
    } else {
      serverError.value = error instanceof ApiError ? error.message : 'Не удалось сменить пароль';
    }
    return;
  }
  if (mandatory.value) {
    await router.replace(homePath(auth.user!));
    return;
  }
  resetForm();
  done.value = true;
});
</script>

<template>
  <main class="change-password">
    <form class="change-password__card iot-card" novalidate @submit="onSubmit">
      <h1>Смена пароля</h1>
      <Message v-if="mandatory" severity="info">
        Вы вошли с временным паролем. Задайте собственный пароль, чтобы продолжить работу.
      </Message>
      <Message v-if="done" severity="success" role="status">
        Пароль изменён. Другие сеансы входа завершены.
      </Message>
      <p class="change-password__hint">
        Не менее {{ minLength }} символов, буквы и цифры; пароль не должен содержать логин.
      </p>

      <div class="change-password__field">
        <label for="current-password">Текущий пароль</label>
        <Password
          v-model="currentPassword"
          v-bind="currentAttrs"
          input-id="current-password"
          :feedback="false"
          toggle-mask
          autocomplete="current-password"
          :invalid="!!errors.currentPassword"
          aria-describedby="current-password-error"
          fluid
        />
        <small id="current-password-error" class="change-password__error">
          {{ errors.currentPassword }}
        </small>
      </div>
      <div class="change-password__field">
        <label for="new-password">Новый пароль</label>
        <Password
          v-model="newPassword"
          v-bind="newAttrs"
          input-id="new-password"
          :feedback="false"
          toggle-mask
          autocomplete="new-password"
          :invalid="!!errors.newPassword"
          aria-describedby="new-password-error"
          fluid
        />
        <small id="new-password-error" class="change-password__error">
          {{ errors.newPassword }}
        </small>
      </div>
      <div class="change-password__field">
        <label for="confirm-password">Повторите новый пароль</label>
        <Password
          v-model="confirmPassword"
          v-bind="confirmAttrs"
          input-id="confirm-password"
          :feedback="false"
          toggle-mask
          autocomplete="new-password"
          :invalid="!!errors.confirmPassword"
          aria-describedby="confirm-password-error"
          fluid
        />
        <small id="confirm-password-error" class="change-password__error">
          {{ errors.confirmPassword }}
        </small>
      </div>

      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <Button type="submit" label="Сменить пароль" icon="pi pi-key" :loading="isSubmitting" fluid />
      <RouterLink
        v-if="!mandatory && auth.user"
        :to="homePath(auth.user)"
        class="change-password__back"
      >
        Вернуться к работе
      </RouterLink>
    </form>
  </main>
</template>

<style scoped>
.change-password {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: var(--iot-space-4);
}

.change-password__card {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
  width: 100%;
  max-width: 440px;
  padding: var(--iot-space-5);
}

.change-password__card h1 {
  margin: 0;
}

.change-password__hint {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.change-password__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.change-password__field label {
  font-weight: 600;
}

.change-password__error {
  min-height: 1em;
  color: var(--iot-tone-danger-text);
}

.change-password__error:empty {
  display: none;
}

.change-password__back {
  align-self: center;
  color: var(--iot-navy-700);
}
</style>
