<script setup lang="ts">
/** Шаги конструктора ИОТ (UC-03; макет, экран 6). На смартфоне — «Шаг N из 7». */
import { STEPS } from './content';

/** `readonly` — на шаге создания черновика к остальным шагам перейти ещё нельзя. */
withDefaults(defineProps<{ current: number; readonly?: boolean }>(), { readonly: false });
const emit = defineEmits<{ select: [step: number] }>();
</script>

<template>
  <nav class="steps" aria-label="Шаги конструктора ИОТ">
    <p class="steps__mobile">
      Шаг {{ current + 1 }} из {{ STEPS.length }}: <strong>{{ STEPS[current] }}</strong>
    </p>
    <ol class="steps__list">
      <li v-for="(step, index) in STEPS" :key="step">
        <button
          type="button"
          class="steps__item"
          :class="{
            'steps__item--done': index < current,
            'steps__item--current': index === current,
          }"
          :aria-current="index === current ? 'step' : undefined"
          :disabled="readonly || index === 0"
          @click="emit('select', index)"
        >
          <i :class="index < current ? 'pi pi-check-circle' : 'pi pi-circle'" aria-hidden="true" />
          {{ index + 1 }}. {{ step }}
        </button>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.steps__mobile {
  display: none;
  margin: 0;
}

.steps__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.steps__item {
  display: inline-flex;
  gap: var(--iot-space-1);
  align-items: center;
  padding: var(--iot-space-1) var(--iot-space-3);
  border: 1px solid var(--iot-color-border);
  border-radius: 999px;
  background: var(--iot-color-surface);
  color: var(--iot-color-muted);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.steps__item:disabled {
  cursor: default;
}

.steps__item--done {
  color: var(--iot-tone-success-text);
}

.steps__item--current {
  border-color: var(--iot-navy-700);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-heading);
  font-weight: 700;
}

@media (max-width: 640px) {
  .steps__mobile {
    display: block;
  }

  .steps__list {
    display: none;
  }
}
</style>
