<script setup lang="ts">
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import StrategiesSettings from '@/views/profiles/StrategiesSettings.vue';

interface SettingItem {
  key: string;
  group: string;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
  value: number;
}

/** Раздел «Настройки»: системные параметры (политика входа). Изменения пишутся в журнал аудита. */
const route = useRoute();
const items = ref<SettingItem[]>([]);
const values = reactive<Record<string, number | null>>({});
const fieldErrors = ref<Record<string, string>>({});
const loading = ref(true);
const loadError = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);
const saveError = ref<string | null>(null);

/** Настройки по разделам в порядке каталога. */
const groups = computed(() => {
  const result = new Map<string, SettingItem[]>();
  for (const item of items.value) result.set(item.group, [...(result.get(item.group) ?? []), item]);
  return [...result.entries()].map(([title, list]) => ({ title, list }));
});

const dirty = computed(() => items.value.some((item) => values[item.key] !== item.value));

function apply(list: SettingItem[]): void {
  items.value = list;
  for (const item of list) values[item.key] = item.value;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    apply(await api<SettingItem[]>('/settings'));
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить настройки';
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  saved.value = false;
  saveError.value = null;
  fieldErrors.value = {};
  const changed = Object.fromEntries(
    items.value
      .filter((item) => values[item.key] !== item.value)
      .map((item) => [item.key, values[item.key]]),
  );
  try {
    apply(await api<SettingItem[]>('/settings', { method: 'PATCH', body: changed }));
    saved.value = true;
  } catch (error) {
    if (error instanceof ApiError) {
      fieldErrors.value = error.fields;
      saveError.value = error.message;
    } else {
      saveError.value = 'Не удалось сохранить настройки';
    }
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="iot-page">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="loading" role="status">Загрузка настроек…</p>
    <form v-else class="settings iot-card" novalidate @submit.prevent="save">
      <fieldset v-for="group in groups" :key="group.title" class="settings__group">
        <legend>{{ group.title }}</legend>
        <div v-for="item in group.list" :key="item.key" class="settings__field">
          <label :for="`setting-${item.key}`">{{ item.label }}</label>
          <div class="settings__control">
            <InputNumber
              v-model="values[item.key]"
              :input-id="`setting-${item.key}`"
              :min="item.min"
              :max="item.max"
              :use-grouping="false"
              show-buttons
              :invalid="!!fieldErrors[item.key]"
              :aria-describedby="`setting-${item.key}-hint`"
            />
            <span class="settings__unit">{{ item.unit }}</span>
          </div>
          <small :id="`setting-${item.key}-hint`" class="settings__hint">
            {{ item.description }} Допустимо: {{ item.min }}–{{ item.max }}, по умолчанию
            {{ item.defaultValue }}.
          </small>
          <small v-if="fieldErrors[item.key]" class="settings__error">{{
            fieldErrors[item.key]
          }}</small>
        </div>
      </fieldset>
      <Message v-if="saved" severity="success" role="status">Настройки сохранены.</Message>
      <Message v-if="saveError" severity="error" role="alert">{{ saveError }}</Message>
      <div>
        <Button
          type="submit"
          label="Сохранить"
          icon="pi pi-save"
          :loading="saving"
          :disabled="!dirty"
        />
      </div>
    </form>
    <section class="settings iot-card" aria-labelledby="settings-strategies">
      <h2 id="settings-strategies">Стратегии сопровождения для мотивационных профилей</h2>
      <StrategiesSettings />
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
  max-width: 720px;
  padding: var(--iot-space-5);
}

.settings h2,
.settings__group legend {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.settings__group {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
  margin: 0;
  padding: 0;
  border: 0;
}

.iot-page {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.settings__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.settings__field label {
  font-weight: 600;
}

.settings__control {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

/* Поле с кнопками не должно растягивать карточку на 360 px. */
.settings__control :deep(.p-inputnumber) {
  flex: 0 1 12rem;
  min-width: 0;
}

.settings__control :deep(.p-inputnumber-input) {
  width: 100%;
  min-width: 0;
}

.settings__unit,
.settings__hint {
  color: var(--iot-color-muted);
}

.settings__hint {
  font-size: 0.875rem;
}

.settings__error {
  color: var(--iot-tone-danger-text);
}

@media (max-width: 575px) {
  .settings {
    padding: var(--iot-space-4);
  }
}
</style>
