<script setup lang="ts">
import {
  LESSON_JOURNAL_STATUS_LABELS,
  type LessonJournalDto,
  type LessonJournalInput,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import { NOT_OBSERVED, SCORE_OPTIONS, type ScoreCell, toCell, toScore } from './scores';

interface Row {
  id: string;
  fullName: string;
  absent: boolean;
  /** Студент уже был отмечен в журнале (строку нужно сохранить, даже если она пуста). */
  recorded: boolean;
  cells: Record<string, ScoreCell>;
}

/**
 * Журнал педагогических наблюдений на занятии (этап 25; FR-014): все студенты группы, по каждому
 * критерию — оценка 1–5 или «Не наблюдалось», либо отметка «Отсутствовал». Пустая клетка — нет
 * данных, а не ноль (FR-074). Журнал виден только сотрудникам (FR-016).
 */
const route = useRoute();
const id = computed(() => String(route.params.id));
const journal = ref<LessonJournalDto | null>(null);
const rows = ref<Row[]>([]);
const error = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);
const saveError = ref<string | null>(null);

const filled = computed(
  () =>
    rows.value.filter(
      (row) =>
        row.absent || journal.value!.criteria.every((criterion) => row.cells[criterion.id] !== ''),
    ).length,
);

function apply(value: LessonJournalDto): void {
  journal.value = value;
  rows.value = value.students.map((item) => ({
    id: item.student.id,
    fullName: item.student.fullName,
    absent: item.absent === true,
    recorded: item.absent !== null,
    cells: Object.fromEntries(
      value.criteria.map((criterion) => [criterion.id, toCell(item.ratings, criterion.id)]),
    ),
  }));
}

async function load(): Promise<void> {
  error.value = null;
  try {
    apply(await api<LessonJournalDto>(`/lessons/${id.value}/journal`));
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить журнал';
  }
}

/** Пустые клетки у присутствовавших — «Не наблюдалось». */
function fillNotObserved(): void {
  for (const row of rows.value) {
    if (row.absent) continue;
    for (const key of Object.keys(row.cells)) {
      if (row.cells[key] === '') row.cells[key] = NOT_OBSERVED;
    }
  }
}

async function save(): Promise<void> {
  saved.value = false;
  saveError.value = null;
  const body: LessonJournalInput = {
    entries: rows.value
      .map((row) => ({
        row,
        ratings: row.absent
          ? []
          : Object.entries(row.cells)
              .filter(([, cell]) => cell !== '')
              .map(([criterionId, cell]) => ({ criterionId, score: toScore(cell) })),
      }))
      .filter(({ row, ratings }) => row.recorded || row.absent || ratings.length > 0)
      .map(({ row, ratings }) => ({ studentId: row.id, absent: row.absent, ratings })),
  };
  saving.value = true;
  try {
    apply(await api<LessonJournalDto>(`/lessons/${id.value}/journal`, { method: 'PUT', body }));
    saved.value = true;
  } catch (failure) {
    saveError.value = failure instanceof ApiError ? failure.message : 'Не удалось сохранить журнал';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="iot-page journal">
    <RouterLink to="/disciplines?tab=lessons" class="journal__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> К занятиям
    </RouterLink>
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!journal" role="status">Загрузка журнала…</p>
    <template v-else>
      <section class="iot-card journal__summary" aria-label="Занятие">
        <strong>{{ formatDate(journal.lesson.date) }}, {{ journal.lesson.startTime }}</strong>
        <span>{{ journal.lesson.group.name }} · {{ journal.lesson.discipline.name }}</span>
        <span class="journal__muted">Преподаватель: {{ journal.lesson.teacher.fullName }}</span>
        <StatusBadge
          :label="`${LESSON_JOURNAL_STATUS_LABELS[journal.lesson.journal.status]}: отмечено ${journal.lesson.journal.done} из ${journal.lesson.journal.total}`"
          :tone="journal.lesson.journal.status === 'COMPLETE' ? 'success' : 'neutral'"
        />
      </section>

      <EmptyState
        v-if="rows.length === 0"
        icon="pi pi-users"
        title="В группе нет студентов"
        description="Добавьте студентов в группу в разделе «Студенты»."
      />
      <form v-else class="journal__form" novalidate @submit.prevent="save">
        <p class="journal__muted">
          Оценка 1–5 по каждому критерию или «Не наблюдалось». Отсутствовавшему оценки не ставятся.
          Пустая клетка — нет данных. Заполнено: {{ filled }} из {{ rows.length }}.
        </p>
        <div>
          <Button
            label="Пустые клетки — «Не наблюдалось»"
            icon="pi pi-minus-circle"
            size="small"
            severity="secondary"
            outlined
            @click="fillNotObserved"
          />
        </div>
        <ul class="journal__list">
          <li v-for="row in rows" :key="row.id" class="iot-card journal__student">
            <div class="journal__student-head">
              <strong>{{ row.fullName }}</strong>
              <label class="journal__absent">
                <Checkbox v-model="row.absent" binary :input-id="`absent-${row.id}`" />
                <span>Отсутствовал</span>
              </label>
            </div>
            <div v-if="!row.absent" class="journal__criteria">
              <div v-for="criterion in journal.criteria" :key="criterion.id" class="iot-field">
                <label :for="`score-${row.id}-${criterion.id}`">
                  {{ criterion.name }}<template v-if="criterion.archived"> (в архиве)</template>
                </label>
                <Select
                  v-model="row.cells[criterion.id]"
                  :input-id="`score-${row.id}-${criterion.id}`"
                  :options="SCORE_OPTIONS"
                  option-label="label"
                  option-value="value"
                  fluid
                />
              </div>
            </div>
            <p v-else class="journal__muted">Отсутствовал на занятии — оценки не ставятся.</p>
          </li>
        </ul>
        <Message v-if="saved" severity="success" role="status">Журнал сохранён.</Message>
        <Message v-if="saveError" severity="error" role="alert">{{ saveError }}</Message>
        <div class="journal__submit">
          <Button type="submit" label="Сохранить журнал" icon="pi pi-save" :loading="saving" />
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.journal {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.journal__back {
  align-self: flex-start;
  color: var(--iot-color-heading);
}

.journal__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2) var(--iot-space-4);
  padding: var(--iot-space-4);
}

.journal__form {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.journal__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.journal__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.journal__student {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  padding: var(--iot-space-3) var(--iot-space-4);
}

.journal__student-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.journal__absent {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-2);
  cursor: pointer;
}

.journal__criteria {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: var(--iot-space-3);
}

.journal__submit {
  position: sticky;
  bottom: 0;
  padding: var(--iot-space-2) 0;
  background: var(--iot-color-bg);
}
</style>
