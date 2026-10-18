<script setup lang="ts">
import { type CabinetFeedbackDto, type FeedbackDto, FeedbackKind } from '@iot/shared';
import Button from 'primevue/button';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import StudentRequestDialog from '@/views/student/StudentRequestDialog.vue';
import FeedbackComposeDialog from './FeedbackComposeDialog.vue';
import FeedbackThread from './FeedbackThread.vue';

/**
 * Комментарии и вопросы по заданию (п. 4.9 «комментирование заданий», FR-064): ветки,
 * привязанные к назначению задания. Преподаватель комментирует (можно внутренней заметкой),
 * студент задаёт вопрос; ответы — в той же ветке.
 */
const props = withDefaults(
  defineProps<{
    mode: 'staff' | 'student';
    /** Назначение задания (trajectory_assignments.id). */
    assignmentId: string;
    assignmentTitle: string;
    studentId?: string | null;
    readonly?: boolean;
  }>(),
  { studentId: null, readonly: false },
);

const items = ref<FeedbackDto[] | null>(null);
const error = ref<string | null>(null);
const composeOpen = ref(false);

async function load(): Promise<void> {
  error.value = null;
  try {
    items.value =
      props.mode === 'staff'
        ? await api<FeedbackDto[]>('/feedback', {
            query: { trajectoryAssignmentId: props.assignmentId },
          })
        : (await api<CabinetFeedbackDto>('/cabinet/feedback')).feedback.filter(
            (item) => item.assignment?.id === props.assignmentId,
          );
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить комментарии';
  }
}

watch(() => props.assignmentId, load, { immediate: true });

function upsert(item: FeedbackDto): void {
  const rows = items.value ?? [];
  items.value = rows.some((row) => row.id === item.id)
    ? rows.map((row) => (row.id === item.id ? item : row))
    : [item, ...rows];
}
</script>

<template>
  <section class="comments" aria-labelledby="assignment-comments-title">
    <div class="comments__head">
      <h2 id="assignment-comments-title" class="comments__title">
        {{ mode === 'staff' ? 'Комментарии к заданию' : 'Вопросы и комментарии' }}
      </h2>
      <Button
        v-if="!readonly"
        :label="mode === 'staff' ? 'Комментировать' : 'Задать вопрос по заданию'"
        :icon="mode === 'staff' ? 'pi pi-comment' : 'pi pi-question-circle'"
        size="small"
        outlined
        @click="composeOpen = true"
      />
    </div>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!items" role="status">Загрузка…</p>
    <p v-else-if="items.length === 0" class="comments__muted">
      {{
        mode === 'staff'
          ? 'Комментариев пока нет. Вопросы студента по этому заданию тоже появятся здесь.'
          : 'Вопросов и комментариев пока нет. Если что-то непонятно — спросите преподавателя.'
      }}
    </p>
    <ul v-else class="comments__list">
      <li v-for="item in items" :key="item.id">
        <FeedbackThread :item="item" :mode="mode" :can-reply="!readonly" @changed="upsert" />
      </li>
    </ul>
    <FeedbackComposeDialog
      v-if="mode === 'staff'"
      v-model:visible="composeOpen"
      :student-id="studentId"
      :trajectories="[]"
      :assignment="{ id: assignmentId, title: assignmentTitle }"
      :initial-kind="FeedbackKind.COMMENT"
      @created="upsert"
    />
    <StudentRequestDialog
      v-else
      v-model:visible="composeOpen"
      kind="QUESTION"
      :assignment="{ id: assignmentId, title: assignmentTitle }"
      @created="upsert"
    />
  </section>
</template>

<style scoped>
.comments {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.comments__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.comments__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.125rem;
}

.comments__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.comments__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
