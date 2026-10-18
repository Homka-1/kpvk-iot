<script setup lang="ts">
import {
  type CabinetConsultationDto,
  type CabinetFeedbackTrajectoryDto,
  CONSULTATION_TOPIC_MAX,
  FEEDBACK_TEXT_MAX,
  type FeedbackDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';

type StudentRequestKind = 'QUESTION' | 'DIFFICULTY_REPORT' | 'CONSULTATION';

const TEXTS: Record<StudentRequestKind, { title: string; label: string; hint: string }> = {
  QUESTION: {
    title: 'Задать вопрос',
    label: 'Ваш вопрос',
    hint: 'Преподаватель получит уведомление и ответит здесь же.',
  },
  DIFFICULTY_REPORT: {
    title: 'Сообщить о затруднении',
    label: 'Что не получается',
    hint: 'Опишите, с чем трудно: преподаватель предложит помощь или консультацию.',
  },
  CONSULTATION: {
    title: 'Запросить консультацию',
    label: 'Что хотите обсудить',
    hint: 'Время консультации назначит преподаватель — вы получите уведомление.',
  },
};

/**
 * Обращение студента (п. 4.9): вопрос, сообщение о затруднении или запрос консультации.
 * Можно указать ИОТ и этап (FR-064); вопрос со страницы задания привязан к заданию.
 */
const props = withDefaults(
  defineProps<{
    kind: StudentRequestKind;
    trajectories?: CabinetFeedbackTrajectoryDto[];
    assignment?: { id: string; title: string } | null;
  }>(),
  { trajectories: () => [], assignment: null },
);
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{
  created: [item: FeedbackDto];
  requested: [item: CabinetConsultationDto];
}>();

const text = ref('');
const trajectoryId = ref<string | null>(null);
const stageId = ref<string | null>(null);
const fields = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

const texts = computed(() => TEXTS[props.kind]);
const consultation = computed(() => props.kind === 'CONSULTATION');
const stageOptions = computed(
  () =>
    props.trajectories
      .find((item) => item.id === trajectoryId.value)
      ?.stages.map((stage) => ({
        value: stage.id,
        label: `Этап ${stage.sortOrder + 1}. ${stage.title}`,
      })) ?? [],
);

watch(visible, (open) => {
  if (!open) return;
  text.value = '';
  trajectoryId.value = props.trajectories.length === 1 ? props.trajectories[0]!.id : null;
  stageId.value = null;
  fields.value = {};
  error.value = null;
  idempotencyKey = newIdempotencyKey();
});
watch(trajectoryId, () => {
  stageId.value = null;
});

async function send(): Promise<void> {
  const value = text.value.trim();
  fields.value = value ? {} : { body: 'Заполните поле' };
  if (!value) return;
  busy.value = true;
  error.value = null;
  const headers = { 'Idempotency-Key': idempotencyKey };
  try {
    if (consultation.value) {
      const created = await api<CabinetConsultationDto>('/cabinet/feedback/consultations', {
        method: 'POST',
        body: { topic: value, trajectoryId: trajectoryId.value },
        headers,
      });
      visible.value = false;
      emit('requested', created);
    } else {
      const created = await api<FeedbackDto>('/cabinet/feedback', {
        method: 'POST',
        body: {
          kind: props.kind,
          body: value,
          trajectoryAssignmentId: props.assignment?.id ?? null,
          trajectoryId: props.assignment ? null : trajectoryId.value,
          stageId: props.assignment ? null : stageId.value,
        },
        headers,
      });
      visible.value = false;
      emit('created', created);
    }
  } catch (caught) {
    if (caught instanceof ApiError) {
      error.value = caught.message;
      fields.value = caught.fields;
    } else {
      error.value = 'Не удалось отправить обращение';
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="texts.title"
    :style="{ width: '32rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="send">
      <p class="request__hint">{{ texts.hint }}</p>
      <p v-if="assignment" class="request__binding">
        <i class="pi pi-link" aria-hidden="true" /> Задание «{{ assignment.title }}»
      </p>
      <template v-else-if="trajectories.length > 0">
        <div class="iot-field">
          <label id="request-trajectory-label" for="request-trajectory">
            Траектория (необязательно)
          </label>
          <Select
            v-model="trajectoryId"
            input-id="request-trajectory"
            aria-labelledby="request-trajectory-label"
            :options="trajectories"
            option-label="disciplineName"
            option-value="id"
            placeholder="Без привязки к траектории"
            show-clear
            fluid
          />
        </div>
        <div v-if="trajectoryId && !consultation" class="iot-field">
          <label id="request-stage-label" for="request-stage">Этап (необязательно)</label>
          <Select
            v-model="stageId"
            input-id="request-stage"
            aria-labelledby="request-stage-label"
            :options="stageOptions"
            option-label="label"
            option-value="value"
            placeholder="Маршрут в целом"
            show-clear
            fluid
          />
        </div>
      </template>
      <div class="iot-field">
        <label for="request-text">{{ texts.label }}</label>
        <Textarea
          id="request-text"
          v-model="text"
          rows="4"
          :maxlength="consultation ? CONSULTATION_TOPIC_MAX : FEEDBACK_TEXT_MAX"
          :invalid="!!(fields.body || fields.topic)"
          aria-describedby="request-text-error"
          fluid
        />
        <small v-if="fields.body || fields.topic" id="request-text-error" class="iot-field-error">
          {{ fields.body || fields.topic }}
        </small>
      </div>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Отправить" icon="pi pi-send" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.request__hint,
.request__binding {
  color: var(--iot-color-muted);
}

.request__binding {
  display: flex;
  align-items: center;
  gap: var(--iot-space-1);
}
</style>
