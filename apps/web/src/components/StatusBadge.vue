<script setup lang="ts">
import { computed } from 'vue';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Иконка по умолчанию для каждого тона: статус передаётся не только цветом (ТЗ, п. 6.1). */
const DEFAULT_ICONS: Record<StatusTone, string> = {
  neutral: 'pi pi-circle',
  info: 'pi pi-info-circle',
  success: 'pi pi-check-circle',
  warning: 'pi pi-exclamation-triangle',
  danger: 'pi pi-times-circle',
};

const props = withDefaults(
  defineProps<{
    /** Текст статуса — обязателен, цвет без текста не допускается. */
    label: string;
    tone?: StatusTone;
    /** CSS-класс иконки PrimeIcons, если нужна иконка, отличная от иконки тона. */
    icon?: string;
  }>(),
  { tone: 'neutral', icon: undefined },
);

const iconClass = computed(() => props.icon ?? DEFAULT_ICONS[props.tone]);
</script>

<template>
  <span class="status-badge" :class="`status-badge--${tone}`" :data-tone="tone">
    <i :class="iconClass" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-1);
  padding: 2px var(--iot-space-2);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.status-badge i {
  font-size: 0.8125rem;
}

.status-badge--neutral {
  background: var(--iot-tone-neutral-bg);
  color: var(--iot-tone-neutral-text);
}

.status-badge--info {
  background: var(--iot-tone-info-bg);
  color: var(--iot-tone-info-text);
}

.status-badge--success {
  background: var(--iot-tone-success-bg);
  color: var(--iot-tone-success-text);
}

.status-badge--warning {
  background: var(--iot-tone-warning-bg);
  color: var(--iot-tone-warning-text);
}

.status-badge--danger {
  background: var(--iot-tone-danger-bg);
  color: var(--iot-tone-danger-text);
}
</style>
