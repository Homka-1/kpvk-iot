<script setup lang="ts">
import { MOTIVATION_LEVEL_LABELS, type MotivationLevel } from '@iot/shared';

/** Карточка профиля со стратегией сопровождения (FR-030). */
defineProps<{
  level: MotivationLevel;
  items: string[];
  /** Выделить карточку текущего профиля студента. */
  current?: boolean;
}>();
</script>

<template>
  <section
    class="strategy iot-card"
    :class="{ 'strategy--current': current }"
    :aria-labelledby="`strategy-${level}`"
  >
    <h3 :id="`strategy-${level}`" class="strategy__title">
      {{ MOTIVATION_LEVEL_LABELS[level] }}
      <span v-if="current" class="strategy__mark">
        <i class="pi pi-check" aria-hidden="true" /> профиль студента
      </span>
    </h3>
    <p class="strategy__subtitle">Стратегия сопровождения</p>
    <ul class="strategy__items">
      <li v-for="item in items" :key="item">{{ item }}</li>
    </ul>
    <slot />
  </section>
</template>

<style scoped>
.strategy {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.strategy--current {
  border-color: var(--iot-navy-700);
  box-shadow: inset 4px 0 0 var(--iot-navy-700);
}

.strategy__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--iot-space-2);
  margin: 0;
  font-size: 1rem;
}

.strategy__mark,
.strategy__subtitle {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
  font-weight: 400;
}

.strategy__subtitle {
  margin: 0;
}

.strategy__items {
  margin: 0;
  padding-left: var(--iot-space-5);
}
</style>
