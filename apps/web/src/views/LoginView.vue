<script setup lang="ts">
import { APP_NAME } from '@iot/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { ref } from 'vue';

/** Страница входа. Проверка учётных данных подключается на этапе 03. */
const login = ref('');
const password = ref('');
const submitted = ref(false);
</script>

<template>
  <main class="login">
    <form class="login__card iot-card" novalidate @submit.prevent="submitted = true">
      <p class="login__app">{{ APP_NAME }}</p>
      <h1>Вход в систему</h1>
      <div class="login__field">
        <label for="login-name">Логин</label>
        <InputText id="login-name" v-model="login" autocomplete="username" fluid />
      </div>
      <div class="login__field">
        <label for="login-password">Пароль</label>
        <Password
          v-model="password"
          input-id="login-password"
          :feedback="false"
          toggle-mask
          autocomplete="current-password"
          fluid
        />
      </div>
      <Message v-if="submitted" severity="info" role="status">
        Вход станет доступен после подключения авторизации.
      </Message>
      <Button type="submit" label="Войти" icon="pi pi-sign-in" fluid />
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

.login__app {
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
</style>
