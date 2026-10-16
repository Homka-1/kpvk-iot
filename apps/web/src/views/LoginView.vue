<script setup lang="ts">
import { APP_NAME, loginFormSchema } from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { useForm } from 'vee-validate';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/http';
import { homePath, safeRedirect } from '@/router/paths';
import { useAuthStore } from '@/stores/auth';

/** Страница входа по логину и паролю. */
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { defineField, errors, handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(loginFormSchema),
  initialValues: { login: '', password: '' },
});
const [login, loginAttrs] = defineField('login');
const [password, passwordAttrs] = defineField('password');
const serverError = ref<string | null>(null);

const onSubmit = handleSubmit(async (values) => {
  serverError.value = null;
  try {
    await auth.login(values.login, values.password);
  } catch (error) {
    serverError.value =
      error instanceof ApiError ? error.message : 'Не удалось выполнить вход. Повторите попытку';
    return;
  }
  await router.replace(safeRedirect(route.query.redirect) ?? homePath(auth.user!));
});
</script>

<template>
  <main class="login">
    <form class="login__card iot-card" novalidate @submit="onSubmit">
      <p class="login__app">{{ APP_NAME }}</p>
      <h1>Вход в систему</h1>
      <div class="login__field">
        <label for="login-name">Логин</label>
        <InputText
          id="login-name"
          v-model="login"
          v-bind="loginAttrs"
          autocomplete="username"
          autocapitalize="off"
          spellcheck="false"
          :invalid="!!errors.login"
          :aria-describedby="errors.login ? 'login-name-error' : undefined"
          fluid
        />
        <small v-if="errors.login" id="login-name-error" class="login__error">
          {{ errors.login }}
        </small>
      </div>
      <div class="login__field">
        <label for="login-password">Пароль</label>
        <Password
          v-model="password"
          v-bind="passwordAttrs"
          input-id="login-password"
          :feedback="false"
          toggle-mask
          autocomplete="current-password"
          :invalid="!!errors.password"
          :aria-describedby="errors.password ? 'login-password-error' : undefined"
          fluid
        />
        <small v-if="errors.password" id="login-password-error" class="login__error">
          {{ errors.password }}
        </small>
      </div>
      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <Button type="submit" label="Войти" icon="pi pi-sign-in" :loading="isSubmitting" fluid />
      <p class="login__hint">
        Забыли пароль? Обратитесь к администратору — он выдаст временный пароль.
      </p>
    </form>
  </main>
</template>

<style scoped>
.login {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: var(--iot-space-4);
}

.login__card {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
  width: 100%;
  max-width: 400px;
  padding: var(--iot-space-5);
}

.login__card h1 {
  margin: 0;
}

.login__app,
.login__hint {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.login__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.login__field label {
  font-weight: 600;
}

.login__error {
  color: var(--iot-tone-danger-text);
}
</style>
