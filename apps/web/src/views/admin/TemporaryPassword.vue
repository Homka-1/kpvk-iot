<script setup lang="ts">
import Message from 'primevue/message';

/** Временный пароль показывается один раз: администратор передаёт его пользователю лично. */
defineProps<{ password: string }>();
</script>

<template>
  <Message severity="warn" role="status">
    <p class="temporary-password__text">
      Временный пароль (показывается один раз):
      <code class="temporary-password__value">{{ password }}</code>
    </p>
    <p class="temporary-password__text">
      Передайте его пользователю лично. При первом входе система потребует задать свой пароль.
    </p>
  </Message>
</template>

<style scoped>
.temporary-password__text {
  margin: 0 0 var(--iot-space-1);
}

.temporary-password__value {
  padding: 2px var(--iot-space-2);
  border-radius: var(--iot-radius);
  background: var(--iot-color-surface);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  user-select: all;
}
</style>
