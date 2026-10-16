<script setup lang="ts">
import Button from 'primevue/button';
import { RouterLink } from 'vue-router';

/**
 * Уведомления и профиль пользователя в шапке. Счётчик уведомлений появится на этапе 15,
 * имя и роль пользователя — после подключения авторизации (этап 03).
 */
</script>

<template>
  <div class="header-actions">
    <Button
      icon="pi pi-bell"
      text
      rounded
      severity="secondary"
      aria-label="Уведомления"
      title="Уведомления"
    />
    <RouterLink to="/login" class="header-actions__user">
      <i class="pi pi-user" aria-hidden="true" />
      <span class="header-actions__user-text">Вход не выполнен</span>
    </RouterLink>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.header-actions__user {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-2);
  min-height: 40px;
  padding: 0 var(--iot-space-2);
  border-radius: var(--iot-radius);
  color: var(--iot-color-text);
  text-decoration: none;
  font-size: 0.875rem;
}

.header-actions__user i {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--iot-navy-100);
  color: var(--iot-navy-800);
}

.header-actions__user:hover {
  background: var(--iot-navy-50);
}

@media (max-width: 767px) {
  .header-actions__user-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
