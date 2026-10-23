<script setup lang="ts">
import {
  LESSON_JOURNAL_STATUS_LABELS,
  type LessonDto,
  type LessonJournalStatus,
  type LessonListDto,
  type LessonOptionsDto,
  LESSONS_LIST_LIMIT,
  Permission,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import DateInput from '@/components/DateInput.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge, { type StatusTone } from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { formatDate } from '@/utils/format';
import { useAction } from '@/views/disciplines/useList';
import ImportLessonsDialog from './ImportLessonsDialog.vue';
import LessonDialog from './LessonDialog.vue';

/**
 * Занятия по расписанию (этап 25): группа и дисциплина — из шапки, период — фильтр панели.
 * Расписание ведут администратор (все группы) и преподаватель (свои пары группа — дисциплина);
 * журнал наблюдений открывается со строки занятия.
 */
const auth = useAuthStore();
const context = useContextStore();
const canManage = computed(() => auth.hasPermission(Permission.LESSONS_MANAGE));
const data = ref<LessonListDto | null>(null);
const error = ref<string | null>(null);
const from = ref('');
const to = ref('');
const periodError = ref<string | null>(null);
const options = ref<LessonOptionsDto | null>(null);
const createOpen = ref(false);
const importOpen = ref(false);
const deleteOpen = ref(false);
const selected = ref<LessonDto | null>(null);
const action = useAction();

const JOURNAL_TONES: Record<LessonJournalStatus, StatusTone> = {
  EMPTY: 'neutral',
  PARTIAL: 'warning',
  COMPLETE: 'success',
};

function journalBadge(lesson: LessonDto) {
  const { status, done, total } = lesson.journal;
  const suffix = status === 'PARTIAL' ? `: ${done} из ${total}` : '';
  return {
    label: `${LESSON_JOURNAL_STATUS_LABELS[status]}${suffix}`,
    tone: JOURNAL_TONES[status],
    icon: status === 'EMPTY' ? 'pi pi-circle' : undefined,
  };
}

async function load(): Promise<void> {
  error.value = null;
  periodError.value = null;
  if (from.value && to.value && to.value < from.value) {
    periodError.value = 'Конец периода раньше начала';
    return;
  }
  try {
    data.value = await api<LessonListDto>('/lessons', {
      query: {
        groupId: context.groupId,
        disciplineId: context.disciplineId,
        from: from.value,
        to: to.value,
      },
    });
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить занятия';
  }
}

async function loadOptions(): Promise<void> {
  if (!canManage.value) return;
  try {
    options.value = await api<LessonOptionsDto>('/lessons/options');
  } catch {
    options.value = null;
  }
}

function askDelete(lesson: LessonDto): void {
  selected.value = lesson;
  action.error.value = null;
  deleteOpen.value = true;
}

async function remove(): Promise<void> {
  const target = selected.value;
  if (!target) return;
  if (await action.run(() => api(`/lessons/${target.id}`, { method: 'DELETE' }))) {
    deleteOpen.value = false;
    void load();
  }
}

watch(() => [context.groupId, context.disciplineId, from.value, to.value], load);
onMounted(() => Promise.all([load(), loadOptions()]));
</script>

<template>
  <div class="lessons">
    <div class="lessons__toolbar">
      <div class="lessons__period">
        <div class="iot-field">
          <label for="lessons-from">С даты</label>
          <DateInput v-model="from" input-id="lessons-from" />
        </div>
        <div class="iot-field">
          <label for="lessons-to">По дату</label>
          <DateInput v-model="to" input-id="lessons-to" :invalid="!!periodError" />
        </div>
      </div>
      <div v-if="canManage" class="lessons__actions">
        <Button
          label="Добавить занятие"
          icon="pi pi-plus"
          size="small"
          :disabled="!options"
          @click="createOpen = true"
        />
        <Button
          label="Импорт расписания"
          icon="pi pi-upload"
          size="small"
          outlined
          @click="importOpen = true"
        />
      </div>
    </div>
    <p class="lessons__hint">
      Группа и дисциплина выбираются в шапке. В журнале занятия отмечаются все студенты группы:
      оценка 1–5 по каждому критерию, «Не наблюдалось» или «Отсутствовал».
    </p>
    <Message v-if="periodError" severity="warn" role="alert">{{ periodError }}</Message>

    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка занятий…</p>
    <EmptyState
      v-else-if="data.items.length === 0"
      icon="pi pi-calendar"
      title="Занятий нет"
      :description="
        canManage
          ? 'Добавьте занятие вручную или загрузите расписание из файла CSV или XLSX.'
          : 'Расписание ещё не загружено или нет занятий за выбранный период.'
      "
    />
    <template v-else>
      <Message v-if="data.truncated" severity="info">
        Показаны последние {{ LESSONS_LIST_LIMIT }} занятий. Уточните период, группу или дисциплину.
      </Message>
      <ul class="lessons__list">
        <li v-for="lesson in data.items" :key="lesson.id" class="iot-card lessons__item">
          <div class="lessons__main">
            <strong>{{ formatDate(lesson.date) }}, {{ lesson.startTime }}</strong>
            <span>{{ lesson.group.name }} · {{ lesson.discipline.name }}</span>
            <span class="lessons__muted">{{ lesson.teacher.fullName }}</span>
          </div>
          <StatusBadge v-bind="journalBadge(lesson)" />
          <div class="lessons__row-actions">
            <RouterLink
              v-if="lesson.canObserve"
              :to="{ name: 'lesson-journal', params: { id: lesson.id } }"
              class="p-button p-button-sm p-button-outlined"
            >
              <i class="pi pi-pencil" aria-hidden="true" />
              <span>Журнал</span>
            </RouterLink>
            <Button
              v-if="lesson.canDelete"
              icon="pi pi-trash"
              text
              size="small"
              severity="danger"
              :aria-label="`Удалить занятие ${formatDate(lesson.date)} ${lesson.startTime}, ${lesson.group.name}`"
              @click="askDelete(lesson)"
            />
          </div>
        </li>
      </ul>
    </template>

    <LessonDialog v-model:visible="createOpen" :options="options" @created="load" />
    <ImportLessonsDialog v-model:visible="importOpen" @imported="load" />
    <ActionDialog
      v-model:visible="deleteOpen"
      title="Удаление занятия"
      :message="
        selected
          ? `Удалить занятие ${formatDate(selected.date)}, ${selected.startTime} (${selected.group.name}, ${selected.discipline.name})? Журнал занятия пуст.`
          : ''
      "
      confirm-label="Удалить"
      danger
      :busy="action.busy.value"
      :error="action.error.value"
      @confirm="remove"
    />
  </div>
</template>

<style scoped>
.lessons {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.lessons__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--iot-space-3);
}

.lessons__period,
.lessons__actions,
.lessons__row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.lessons__period .iot-field {
  flex: 1 1 10rem;
  min-width: 0;
}

.lessons__hint,
.lessons__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.lessons__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lessons__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-3);
  padding: var(--iot-space-3) var(--iot-space-4);
}

.lessons__main {
  display: flex;
  flex: 1 1 16rem;
  flex-direction: column;
  gap: var(--iot-space-1);
  min-width: 0;
}

.lessons__row-actions a {
  gap: var(--iot-space-2);
  text-decoration: none;
}
</style>
