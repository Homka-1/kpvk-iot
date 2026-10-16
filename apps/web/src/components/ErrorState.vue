<script setup lang="ts">
import Button from 'primevue/button';

/** Понятное сообщение об ошибке с возможностью повторить действие (NFR-005). */
withDefaults(
  defineProps<{
    title?: string;
    message?: string;
    /** Показать кнопку «Повторить». */
    retryable?: boolean;
  }>(),
  {
    title: 'Не удалось загрузить данные',
    message: 'Проверьте подключение к сети и попробуйте ещё раз.',
    retryable: false,
  },
);

defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="error-state" role="alert">
    <i class="pi pi-exclamation-circle error-state__icon" aria-hidden="true" />
    <h2 class="error-state__title">{{ title }}</h2>
    <p class="error-state__message">{{ message }}</p>
    <div v-if="retryable || $slots.default" class="error-state__actions">
      <Button
        v-if="retryable"
        label="Повторить"
        icon="pi pi-refresh"
        severity="secondary"
        @click="$emit('retry')"
      />
      <slot />
    </div>
  </section>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--iot-space-2);
  padding: var(--iot-space-6) var(--iot-space-4);
  text-align: center;
  background: var(--iot-tone-danger-bg);
  border: 1px solid #f0c4c4;
  border-radius: var(--iot-radius);
  color: var(--iot-tone-danger-text);
}

.error-state__icon {
  font-size: 2rem;
}

.error-state__title {
  font-size: 1.125rem;
  margin: 0;
  color: inherit;
}

.error-state__message {
  margin: 0;
  max-width: 48ch;
}

.error-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--iot-space-2);
  margin-top: var(--iot-space-2);
}
</style>
