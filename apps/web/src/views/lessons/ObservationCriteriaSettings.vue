<script setup lang="ts">
import {
  OBSERVATION_CRITERIA_MAX,
  OBSERVATION_CRITERION_NAME_MAX,
  observationCriteriaSchema,
  type ObservationCriterionDto,
} from '@iot/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';

interface Row {
  id?: string;
  name: string;
  archived: boolean;
  /** Ключ строки для v-for (у новых критериев id ещё нет). */
  key: string;
}

/**
 * Критерии наблюдения на занятиях в разделе «Настройки» (этап 25). Порядок — порядок столбцов
 * журнала. Критерии не удаляются, а убираются в архив: оценки по ним сохраняются в истории.
 */
const rows = ref<Row[]>([]);
const loaded = ref(false);
const loadError = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);
const saveError = ref<string | null>(null);
let counter = 0;

const activeCount = computed(() => rows.value.filter((row) => !row.archived).length);

function apply(list: ObservationCriterionDto[]): void {
  rows.value = list.map((item) => ({ ...item, key: item.id }));
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    apply(await api<ObservationCriterionDto[]>('/observation-criteria'));
    loaded.value = true;
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить критерии';
  }
}

function add(): void {
  counter += 1;
  rows.value.push({ name: '', archived: false, key: `new-${counter}` });
}

function move(index: number, shift: -1 | 1): void {
  const list = [...rows.value];
  const [row] = list.splice(index, 1);
  list.splice(index + shift, 0, row!);
  rows.value = list;
}

function remove(index: number): void {
  rows.value.splice(index, 1);
}

async function save(): Promise<void> {
  saved.value = false;
  saveError.value = null;
  const items = rows.value.map(({ id, name, archived }) => ({ id, name: name.trim(), archived }));
  const parsed = observationCriteriaSchema.safeParse(items);
  if (!parsed.success) {
    saveError.value = parsed.error.issues[0]?.message ?? 'Проверьте список критериев';
    return;
  }
  saving.value = true;
  try {
    apply(
      await api<ObservationCriterionDto[]>('/observation-criteria', {
        method: 'PUT',
        body: { items },
      }),
    );
    saved.value = true;
  } catch (error) {
    saveError.value = error instanceof ApiError ? error.message : 'Не удалось сохранить критерии';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
  <p v-else-if="!loaded" role="status">Загрузка критериев…</p>
  <form v-else class="criteria" novalidate @submit.prevent="save">
    <p class="criteria__hint">
      Критерии — столбцы журнала занятия; каждому студенту ставится оценка от 1 до 5 или отметка «Не
      наблюдалось». Действующих критериев — не более {{ OBSERVATION_CRITERIA_MAX }}. Критерий с
      оценками не удаляется: уберите его в архив, история наблюдений сохранится.
    </p>
    <ol class="criteria__list">
      <li v-for="(row, index) in rows" :key="row.key" class="criteria__row">
        <InputText
          v-model="row.name"
          :aria-label="`Критерий ${index + 1}`"
          :maxlength="OBSERVATION_CRITERION_NAME_MAX"
          :disabled="row.archived"
          class="criteria__name"
        />
        <StatusBadge v-if="row.archived" label="В архиве" tone="neutral" icon="pi pi-box" />
        <div class="criteria__actions">
          <Button
            icon="pi pi-arrow-up"
            text
            size="small"
            :aria-label="`Переместить выше: ${row.name || 'новый критерий'}`"
            :disabled="index === 0"
            @click="move(index, -1)"
          />
          <Button
            icon="pi pi-arrow-down"
            text
            size="small"
            :aria-label="`Переместить ниже: ${row.name || 'новый критерий'}`"
            :disabled="index === rows.length - 1"
            @click="move(index, 1)"
          />
          <Button
            v-if="!row.id"
            icon="pi pi-times"
            text
            size="small"
            severity="secondary"
            :aria-label="`Убрать новый критерий ${index + 1}`"
            @click="remove(index)"
          />
          <Button
            v-else
            :label="row.archived ? 'Вернуть' : 'В архив'"
            :icon="row.archived ? 'pi pi-replay' : 'pi pi-box'"
            text
            size="small"
            severity="secondary"
            @click="row.archived = !row.archived"
          />
        </div>
      </li>
    </ol>
    <div>
      <Button
        label="Добавить критерий"
        icon="pi pi-plus"
        size="small"
        outlined
        :disabled="activeCount >= OBSERVATION_CRITERIA_MAX"
        @click="add"
      />
    </div>
    <Message v-if="saved" severity="success" role="status">Критерии сохранены.</Message>
    <Message v-if="saveError" severity="error" role="alert">{{ saveError }}</Message>
    <div>
      <Button type="submit" label="Сохранить критерии" icon="pi pi-save" :loading="saving" />
    </div>
  </form>
</template>

<style scoped>
.criteria {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.criteria__hint {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.criteria__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding-left: var(--iot-space-5);
}

.criteria__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.criteria__name {
  flex: 1 1 14rem;
  min-width: 0;
}

.criteria__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1);
}
</style>
