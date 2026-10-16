<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import { formatNumber } from '@/utils/format';

/**
 * Карточка-показатель. `null`/`undefined` означает «нет данных» — показывается текст,
 * а не ноль (FR-005, FR-074). Ссылка `to` ведёт к отфильтрованному списку (FR-003).
 */
const props = withDefaults(
  defineProps<{
    label: string;
    value?: number | string | null;
    unit?: string;
    /** Пояснение под значением, например источник или период. */
    hint?: string;
    icon?: string;
    to?: RouteLocationRaw;
  }>(),
  { value: null, unit: undefined, hint: undefined, icon: undefined, to: undefined },
);

const hasValue = computed(() => props.value !== null && props.value !== undefined);
const displayValue = computed(() =>
  typeof props.value === 'number' ? formatNumber(props.value) : props.value,
);
</script>

<template>
  <component :is="to ? RouterLink : 'div'" :to="to" class="metric-card iot-card">
    <span class="metric-card__label">
      <i v-if="icon" :class="icon" aria-hidden="true" />
      {{ label }}
    </span>
    <span v-if="hasValue" class="metric-card__value">
      {{ displayValue }}<span v-if="unit" class="metric-card__unit">&nbsp;{{ unit }}</span>
    </span>
    <span v-else class="metric-card__value metric-card__value--empty">Нет данных</span>
    <span v-if="hint" class="metric-card__hint">{{ hint }}</span>
  </component>
</template>

<style scoped>
.metric-card {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

a.metric-card:hover {
  border-color: var(--iot-navy-700);
}

.metric-card__label {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.metric-card__value {
  color: var(--iot-color-heading);
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.2;
}

.metric-card__value--empty {
  color: var(--iot-color-muted);
  font-size: 1rem;
  font-weight: 600;
}

.metric-card__unit {
  font-size: 1rem;
  font-weight: 600;
}

.metric-card__hint {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}
</style>
