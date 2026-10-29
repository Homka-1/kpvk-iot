<script setup lang="ts">
import {
  type ControlImportRowDto,
  type ControlMark,
  type ControlSheetDto,
  type ControlWorkDto,
  isControlScore,
} from '@iot/shared';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { formatDate } from '@/utils/format';
import ControlImportDialog from './ControlImportDialog.vue';
import { MARK_OPTIONS, resultText } from './format';

type Choice = 'SCORE' | ControlMark;
interface Row {
  id: string;
  fullName: string;
  choice: Choice;
  score: number | null;
}

/**
 * Ведомость группы по контрольной работе: все студенты группы (ФИО из базы), у каждого — балл
 * 0–100 или отметка «Отсутствовал», «Не выполнил работу», «Освобождён». Пустой балл — нет данных,
 * нулём он не становится (FR-074). Результаты можно подставить из файла и сохранить после проверки.
 */
const props = defineProps<{ work: ControlWorkDto; groupId: string }>();
const emit = defineEmits<{ saved: [] }>();

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'SCORE', label: 'Балл' },
  ...MARK_OPTIONS,
];

const sheet = ref<ControlSheetDto | null>(null);
const rows = ref<Row[]>([]);
const error = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);
const saveError = ref<string | null>(null);
const importOpen = ref(false);

const filled = computed(
  () => rows.value.filter((row) => row.choice !== 'SCORE' || row.score !== null).length,
);
const invalid = computed(() =>
  rows.value.some(
    (row) => row.choice === 'SCORE' && row.score !== null && !isControlScore(row.score),
  ),
);

function apply(value: ControlSheetDto): void {
  sheet.value = value;
  rows.value = value.rows.map((row) => ({
    id: row.student.id,
    fullName: row.student.fullName,
    choice: row.mark ?? 'SCORE',
    score: row.score,
  }));
}

async function load(): Promise<void> {
  error.value = null;
  saved.value = false;
  try {
    apply(
      await api<ControlSheetDto>(`/control-works/${props.work.id}/groups/${props.groupId}/results`),
    );
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить ведомость';
  }
}

function fromFile(imported: ControlImportRowDto[]): void {
  for (const item of imported) {
    const row = rows.value.find((candidate) => candidate.id === item.resolved!.student.id);
    if (!row) continue;
    row.choice = item.resolved!.mark ?? 'SCORE';
    row.score = item.resolved!.score;
  }
  saved.value = false;
}

async function save(): Promise<void> {
  saved.value = false;
  saveError.value = null;
  if (invalid.value) {
    saveError.value = 'Балл — число от 0 до 100, не более одного знака после запятой';
    return;
  }
  saving.value = true;
  try {
    apply(
      await api<ControlSheetDto>(
        `/control-works/${props.work.id}/groups/${props.groupId}/results`,
        {
          method: 'PUT',
          body: {
            entries: rows.value.map((row) => ({
              studentId: row.id,
              score: row.choice === 'SCORE' ? row.score : null,
              mark: row.choice === 'SCORE' ? null : row.choice,
            })),
          },
        },
      ),
    );
    saved.value = true;
    emit('saved');
  } catch (failure) {
    saveError.value =
      failure instanceof ApiError ? failure.message : 'Не удалось сохранить ведомость';
  } finally {
    saving.value = false;
  }
}

watch(() => [props.work.id, props.groupId], load, { immediate: true });
</script>

<template>
  <section class="sheet" aria-label="Ведомость группы">
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!sheet" role="status">Загрузка ведомости…</p>
    <EmptyState
      v-else-if="rows.length === 0"
      icon="pi pi-users"
      title="В группе нет студентов"
      description="Добавьте студентов в группу в разделе «Студенты»."
    />
    <template v-else-if="!sheet.canEdit">
      <p class="sheet__muted">
        {{ sheet.group.name }}, {{ formatDate(sheet.date) }}. Результаты вносит преподаватель
        дисциплины в этой группе.
      </p>
      <ul class="sheet__readonly">
        <li v-for="row in sheet.rows" :key="row.student.id">
          <span>{{ row.student.fullName }}</span>
          <strong>{{ resultText(row) }}</strong>
        </li>
      </ul>
    </template>
    <form v-else class="sheet__form" novalidate @submit.prevent="save">
      <div class="sheet__head">
        <p class="sheet__muted">
          {{ sheet.group.name }}, {{ formatDate(sheet.date) }}. Балл 0–100 или отметка; пустой балл
          — нет данных. Заполнено: {{ filled }} из {{ rows.length }}.
        </p>
        <Button
          label="Из файла"
          icon="pi pi-upload"
          size="small"
          severity="secondary"
          outlined
          @click="importOpen = true"
        />
      </div>
      <ul class="sheet__list">
        <li v-for="row in rows" :key="row.id" class="sheet__row">
          <span class="sheet__name">{{ row.fullName }}</span>
          <div class="sheet__inputs">
            <label :for="`choice-${row.id}`" class="iot-visually-hidden">
              Результат: {{ row.fullName }}
            </label>
            <Select
              v-model="row.choice"
              :input-id="`choice-${row.id}`"
              :options="CHOICES"
              option-label="label"
              option-value="value"
              class="sheet__choice"
            />
            <template v-if="row.choice === 'SCORE'">
              <label :for="`score-${row.id}`" class="iot-visually-hidden">
                Балл: {{ row.fullName }}
              </label>
              <InputNumber
                v-model="row.score"
                :input-id="`score-${row.id}`"
                :min="0"
                :max="100"
                :max-fraction-digits="1"
                locale="ru-RU"
                placeholder="Нет данных"
                :invalid="row.score !== null && !isControlScore(row.score)"
                class="sheet__score"
              />
            </template>
          </div>
        </li>
      </ul>
      <Message v-if="saved" severity="success" role="status">Ведомость сохранена.</Message>
      <Message v-if="saveError" severity="error" role="alert">{{ saveError }}</Message>
      <div class="sheet__submit">
        <Button type="submit" label="Сохранить ведомость" icon="pi pi-save" :loading="saving" />
      </div>
      <ControlImportDialog
        v-model:visible="importOpen"
        :work-id="work.id"
        :group-id="groupId"
        :group-name="sheet.group.name"
        @apply="fromFile"
      />
    </form>
  </section>
</template>

<style scoped>
.sheet,
.sheet__form {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.sheet__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.sheet__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.sheet__list,
.sheet__readonly {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sheet__row,
.sheet__readonly li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
  padding: var(--iot-space-2) 0;
  border-bottom: 1px solid var(--iot-color-border);
}

.sheet__name {
  flex: 1 1 14rem;
  overflow-wrap: anywhere;
}

.sheet__inputs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.sheet__choice {
  width: 13rem;
  max-width: 100%;
}

.sheet__score :deep(input) {
  width: 7rem;
}

.sheet__submit {
  position: sticky;
  bottom: 0;
  padding: var(--iot-space-2) 0;
  background: var(--iot-color-bg);
}
</style>
