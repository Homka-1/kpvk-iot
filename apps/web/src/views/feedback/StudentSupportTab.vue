<script setup lang="ts">
import type { ConsultationDto, FeedbackDto, StudentSupportDto } from '@iot/shared';
import Button from 'primevue/button';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import ConsultationDialog from './ConsultationDialog.vue';
import FeedbackComposeDialog from './FeedbackComposeDialog.vue';
import InteractionTimeline from './InteractionTimeline.vue';

/**
 * Обратная связь в профиле студента (вкладка «Сопровождение»): история взаимодействия
 * (FR-063), консультации (FR-067), рефлексия, новое сообщение и консультация.
 */
const props = defineProps<{ studentId: string; archived: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const data = ref<StudentSupportDto | null>(null);
const error = ref<string | null>(null);
const composeOpen = ref(false);
const consultationOpen = ref(false);

async function load(): Promise<void> {
  error.value = null;
  try {
    data.value = await api<StudentSupportDto>(`/students/${props.studentId}/support`);
  } catch (caught) {
    error.value =
      caught instanceof ApiError ? caught.message : 'Не удалось загрузить историю взаимодействия';
  }
}

watch(
  () => props.studentId,
  () => {
    data.value = null;
    void load();
  },
  { immediate: true },
);

function onFeedback(item: FeedbackDto): void {
  if (!data.value) return;
  const exists = data.value.feedback.some((row) => row.id === item.id);
  data.value.feedback = exists
    ? data.value.feedback.map((row) => (row.id === item.id ? item : row))
    : [item, ...data.value.feedback];
  emit('changed');
}

function onConsultation(item: ConsultationDto): void {
  if (!data.value) return;
  const exists = data.value.consultations.some((row) => row.id === item.id);
  data.value.consultations = exists
    ? data.value.consultations.map((row) => (row.id === item.id ? item : row))
    : [item, ...data.value.consultations];
  emit('changed');
}
</script>

<template>
  <section class="support" aria-labelledby="support-title">
    <div class="support__head">
      <h2 id="support-title" class="support__title">Обратная связь и консультации</h2>
      <div v-if="!archived" class="support__actions">
        <Button
          label="Написать студенту"
          icon="pi pi-send"
          size="small"
          outlined
          @click="composeOpen = true"
        />
        <Button
          label="Назначить консультацию"
          icon="pi pi-calendar-plus"
          size="small"
          outlined
          @click="consultationOpen = true"
        />
      </div>
    </div>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <InteractionTimeline
      v-else
      :feedback="data.feedback"
      :consultations="data.consultations"
      :reflections="data.reflections"
      mode="staff"
      :can-manage="!archived"
      empty-text="Здесь появятся рекомендации, вопросы студента, консультации и рефлексия."
      @feedback-changed="onFeedback"
      @consultation-changed="onConsultation"
    />
    <FeedbackComposeDialog
      v-model:visible="composeOpen"
      :student-id="studentId"
      :trajectories="data?.trajectories ?? []"
      @created="onFeedback"
    />
    <ConsultationDialog
      v-model:visible="consultationOpen"
      :student-id="studentId"
      :trajectories="data?.trajectories ?? []"
      @saved="onConsultation"
    />
  </section>
</template>

<style scoped>
.support {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.support__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.support__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.125rem;
}

.support__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}
</style>
