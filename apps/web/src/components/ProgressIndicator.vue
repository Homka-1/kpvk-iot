<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '@/utils/format';

/** Прогресс в процентах с подписью; `null` — «нет данных», а не 0 % (FR-005). */
const props = withDefaults(
  defineProps<{
    label: string;
    value?: number | null;
  }>(),
  { value: null },
);

const percent = computed(() =>
  props.value === null ? null : Math.min(100, Math.max(0, Math.round(props.value))),
);
</script>

<template>
  <div class="progress-indicator">
    <div class="progress-indicator__header">
      <span class="progress-indicator__label">{{ label }}</span>
      <span class="progress-indicator__value">
        {{ percent === null ? 'Нет данных' : `${formatNumber(percent)} %` }}
      </span>
    </div>
    <div
      v-if="percent !== null"
      class="progress-indicator__track"
      role="progressbar"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="percent"
      :aria-valuetext="`${percent} %`"
    >
      <div class="progress-indicator__bar" :style="{ width: `${percent}%` }" />
    </div>
    <div v-else class="progress-indicator__track progress-indicator__track--empty" />
  </div>
</template>

<style scoped>
.progress-indicator {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.progress-indicator__header {
  display: flex;
  justify-content: space-between;
  gap: var(--iot-space-2);
  font-size: 0.875rem;
}

.progress-indicator__label {
  color: var(--iot-color-muted);
}

.progress-indicator__value {
  color: var(--iot-color-heading);
  font-weight: 600;
  white-space: nowrap;
}

.progress-indicator__track {
  height: 8px;
  background: var(--iot-navy-100);
  border-radius: 999px;
  overflow: hidden;
}

.progress-indicator__track--empty {
  background: repeating-linear-gradient(
    45deg,
    var(--iot-tone-neutral-bg) 0 6px,
    var(--iot-color-border) 6px 12px
  );
}

.progress-indicator__bar {
  height: 100%;
  background: var(--iot-navy-700);
  border-radius: inherit;
}
</style>
