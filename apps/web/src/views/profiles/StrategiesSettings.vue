<script setup lang="ts">
import {
  MOTIVATION_LEVEL_LABELS,
  MOTIVATION_LEVELS,
  type MotivationLevel,
  type MotivationStrategiesDto,
  motivationStrategiesSchema,
  STRATEGY_ITEMS_MAX,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';

/**
 * Тексты стратегий сопровождения для трёх профилей (FR-030) в разделе «Настройки».
 * Один пункт — одна строка. Изменение записывается в журнал аудита.
 */
const texts = reactive<Record<MotivationLevel, string>>({ HIGH: '', MEDIUM: '', LOW: '' });
const errors = ref<Partial<Record<MotivationLevel, string>>>({});
const loaded = ref(false);
const loadError = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);
const saveError = ref<string | null>(null);

const toLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function apply(value: MotivationStrategiesDto): void {
  for (const level of MOTIVATION_LEVELS) texts[level] = value[level].join('\n');
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    apply(await api<MotivationStrategiesDto>('/motivation-strategies'));
    loaded.value = true;
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить стратегии';
  }
}

async function save(): Promise<void> {
  saved.value = false;
  saveError.value = null;
  const body = Object.fromEntries(MOTIVATION_LEVELS.map((level) => [level, toLines(texts[level])]));
  const parsed = motivationStrategiesSchema.safeParse(body);
  errors.value = parsed.success
    ? {}
    : Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message]));
  if (!parsed.success) return;
  saving.value = true;
  try {
    apply(await api<MotivationStrategiesDto>('/motivation-strategies', { method: 'PUT', body }));
    saved.value = true;
  } catch (error) {
    saveError.value = error instanceof ApiError ? error.message : 'Не удалось сохранить стратегии';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
  <p v-else-if="!loaded" role="status">Загрузка стратегий…</p>
  <form v-else class="strategies-settings" novalidate @submit.prevent="save">
    <p class="strategies-settings__hint">
      Показываются в карточках профилей и в профиле студента. Один пункт — одна строка, не более
      {{ STRATEGY_ITEMS_MAX }} пунктов.
    </p>
    <div v-for="level in MOTIVATION_LEVELS" :key="level" class="iot-field">
      <label :for="`strategy-${level}`">{{ MOTIVATION_LEVEL_LABELS[level] }}</label>
      <Textarea
        :id="`strategy-${level}`"
        v-model="texts[level]"
        rows="5"
        :invalid="!!errors[level]"
        fluid
      />
      <small v-if="errors[level]" class="iot-field-error">{{ errors[level] }}</small>
    </div>
    <Message v-if="saved" severity="success" role="status">Стратегии сохранены.</Message>
    <Message v-if="saveError" severity="error" role="alert">{{ saveError }}</Message>
    <div>
      <Button type="submit" label="Сохранить стратегии" icon="pi pi-save" :loading="saving" />
    </div>
  </form>
</template>

<style scoped>
.strategies-settings {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.strategies-settings__hint {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
