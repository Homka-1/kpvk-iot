<script setup lang="ts">
/** Пустое состояние: пояснение вместо фиктивных показателей (FR-005). */
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    icon?: string;
  }>(),
  { description: undefined, icon: 'pi pi-inbox' },
);
</script>

<template>
  <section class="empty-state" role="status">
    <i :class="icon" class="empty-state__icon" aria-hidden="true" />
    <h2 class="empty-state__title">{{ title }}</h2>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--iot-space-2);
  padding: var(--iot-space-6) var(--iot-space-4);
  text-align: center;
  background: var(--iot-color-info-bg);
  border: 1px solid var(--iot-color-info-border);
  border-radius: var(--iot-radius);
  color: var(--iot-color-info-text);
}

.empty-state__icon {
  font-size: 2rem;
}

.empty-state__title {
  font-size: 1.125rem;
  margin: 0;
}

.empty-state__description {
  margin: 0;
  max-width: 48ch;
}

.empty-state__actions {
  margin-top: var(--iot-space-2);
}
</style>
