<script setup lang="ts">
import {
  type FeedbackDto,
  type PendingReflectionDto,
  REFLECTION_TEXT_MAX,
  type ReflectionDto,
  SELF_ASSESSMENT_MAX,
  SELF_ASSESSMENT_MIN,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import SelectButton from 'primevue/selectbutton';
import Textarea from 'primevue/textarea';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import { SELF_ASSESSMENT_HINT } from '@/views/feedback/content';

/**
 * Форма рефлексии (FR-066): после контрольной точки или в ответ на запрос самооценки.
 * Самооценка 1–5 и три вопроса; достаточно заполнить что-то одно.
 */
const props = withDefaults(
  defineProps<{
    checkpoint?: PendingReflectionDto | null;
    request?: FeedbackDto | null;
  }>(),
  { checkpoint: null, request: null },
);
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [item: ReflectionDto] }>();

const selfAssessment = ref<number | null>(null);
const achievements = ref('');
const difficulties = ref('');
const nextSteps = ref('');
const fieldError = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

const scale = Array.from({ length: SELF_ASSESSMENT_MAX - SELF_ASSESSMENT_MIN + 1 }, (_, index) => {
  const value = SELF_ASSESSMENT_MIN + index;
  return { value, label: String(value) };
});
const title = computed(() =>
  props.checkpoint ? 'Рефлексия после контрольной точки' : 'Самооценка',
);

watch(visible, (open) => {
  if (!open) return;
  selfAssessment.value = null;
  achievements.value = '';
  difficulties.value = '';
  nextSteps.value = '';
  fieldError.value = null;
  error.value = null;
  idempotencyKey = newIdempotencyKey();
});

async function save(): Promise<void> {
  const filled =
    selfAssessment.value !== null ||
    [achievements, difficulties, nextSteps].some((field) => field.value.trim() !== '');
  fieldError.value = filled ? null : 'Поставьте самооценку или ответьте хотя бы на один вопрос';
  if (!filled) return;
  busy.value = true;
  error.value = null;
  try {
    const saved = await api<ReflectionDto>('/cabinet/feedback/reflections', {
      method: 'POST',
      body: {
        checkpointId: props.checkpoint?.checkpointId ?? null,
        requestId: props.request?.id ?? null,
        selfAssessment: selfAssessment.value,
        achievements: achievements.value,
        difficulties: difficulties.value,
        nextSteps: nextSteps.value,
      },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    visible.value = false;
    emit('saved', saved);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось сохранить рефлексию';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="title"
    :style="{ width: '34rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <p v-if="checkpoint" class="reflection-form__context">
        «{{ checkpoint.title }}» · {{ checkpoint.trajectory.disciplineName }} · этап
        {{ checkpoint.stage.sortOrder + 1 }}. {{ checkpoint.stage.title }}
      </p>
      <p v-else-if="request" class="reflection-form__context">{{ request.body }}</p>
      <fieldset class="reflection-form__scale">
        <legend class="iot-field__label">Как вы оцениваете свою работу?</legend>
        <SelectButton
          v-model="selfAssessment"
          :options="scale"
          option-label="label"
          option-value="value"
          aria-describedby="reflection-scale-hint"
          aria-label="Самооценка"
        />
        <small id="reflection-scale-hint" class="iot-field-hint">{{ SELF_ASSESSMENT_HINT }}</small>
      </fieldset>
      <div class="iot-field">
        <label for="reflection-achievements">Что получилось?</label>
        <Textarea
          id="reflection-achievements"
          v-model="achievements"
          rows="2"
          :maxlength="REFLECTION_TEXT_MAX"
          fluid
        />
      </div>
      <div class="iot-field">
        <label for="reflection-difficulties">Что было трудно?</label>
        <Textarea
          id="reflection-difficulties"
          v-model="difficulties"
          rows="2"
          :maxlength="REFLECTION_TEXT_MAX"
          fluid
        />
      </div>
      <div class="iot-field">
        <label for="reflection-next">Что будете делать дальше?</label>
        <Textarea
          id="reflection-next"
          v-model="nextSteps"
          rows="2"
          :maxlength="REFLECTION_TEXT_MAX"
          fluid
        />
      </div>
      <small v-if="fieldError" class="iot-field-error" role="alert">{{ fieldError }}</small>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Отправить" icon="pi pi-send" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.reflection-form__context {
  color: var(--iot-color-muted);
  white-space: pre-wrap;
}

.reflection-form__scale {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  border: 0;
}
</style>
