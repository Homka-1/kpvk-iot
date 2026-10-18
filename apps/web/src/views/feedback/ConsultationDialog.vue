<script setup lang="ts">
import {
  type CabinetFeedbackTrajectoryDto,
  CONSULTATION_TOPIC_MAX,
  type ConsultationDto,
  todayIsoDate,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import { type StudentOption, toIsoDateTime } from './content';

/**
 * Назначение консультации преподавателем (п. 4.9, UC-05) или время для запрошенной студентом
 * консультации и перенос назначенной. Студент получает уведомление (FR-065).
 */
const props = withDefaults(
  defineProps<{
    /** Консультация, которой назначается время; без неё — новая консультация. */
    consultation?: ConsultationDto | null;
    studentId?: string | null;
    students?: StudentOption[];
    trajectories?: CabinetFeedbackTrajectoryDto[];
    /** ИОТ по умолчанию (переход из мониторинга). */
    trajectoryId?: string | null;
  }>(),
  {
    consultation: null,
    studentId: null,
    students: () => [],
    trajectories: () => [],
    trajectoryId: null,
  },
);
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [item: ConsultationDto] }>();

const student = ref<string | null>(null);
const topic = ref('');
const trajectory = ref<string | null>(null);
const date = ref('');
const time = ref('');
const fields = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

const creating = computed(() => !props.consultation);
const title = computed(() =>
  creating.value
    ? 'Назначить консультацию'
    : props.consultation?.status === 'REQUESTED'
      ? 'Назначить время консультации'
      : 'Перенести консультацию',
);

watch(visible, (open) => {
  if (!open) return;
  student.value = props.studentId;
  topic.value = '';
  trajectory.value = props.trajectoryId;
  date.value = '';
  time.value = '';
  fields.value = {};
  error.value = null;
  idempotencyKey = newIdempotencyKey();
});

async function save(): Promise<void> {
  const errors: Record<string, string> = {};
  if (creating.value && !student.value) errors.studentId = 'Выберите студента';
  if (creating.value && !topic.value.trim()) errors.topic = 'Укажите тему консультации';
  const scheduledAt = toIsoDateTime(date.value, time.value.trim());
  if (!date.value) errors.scheduledAt = 'Укажите дату';
  else if (date.value < todayIsoDate()) errors.scheduledAt = 'Дата консультации уже прошла';
  else if (!scheduledAt) errors.time = 'Укажите время в формате чч:мм, например 14:30';
  fields.value = errors;
  if (Object.keys(errors).length > 0) return;
  busy.value = true;
  error.value = null;
  try {
    const saved = creating.value
      ? await api<ConsultationDto>('/consultations', {
          method: 'POST',
          body: {
            studentId: student.value,
            topic: topic.value.trim(),
            scheduledAt,
            trajectoryId: trajectory.value,
          },
          headers: { 'Idempotency-Key': idempotencyKey },
        })
      : await api<ConsultationDto>(`/consultations/${props.consultation!.id}/schedule`, {
          method: 'POST',
          body: { scheduledAt },
        });
    visible.value = false;
    emit('saved', saved);
  } catch (caught) {
    if (caught instanceof ApiError) {
      error.value = caught.message;
      fields.value = caught.fields;
    } else {
      error.value = 'Не удалось сохранить консультацию';
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
    :header="title"
    :style="{ width: '32rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <p v-if="consultation">«{{ consultation.topic }}» · {{ consultation.student.fullName }}</p>
      <template v-if="creating">
        <div v-if="!studentId" class="iot-field">
          <label id="consultation-student-label" for="consultation-student">Студент</label>
          <Select
            v-model="student"
            input-id="consultation-student"
            aria-labelledby="consultation-student-label"
            :options="students"
            option-label="label"
            option-value="id"
            placeholder="Выберите студента"
            filter
            :invalid="!!fields.studentId"
            fluid
          />
          <small v-if="fields.studentId" class="iot-field-error">{{ fields.studentId }}</small>
        </div>
        <div class="iot-field">
          <label for="consultation-topic">Тема</label>
          <InputText
            id="consultation-topic"
            v-model="topic"
            :maxlength="CONSULTATION_TOPIC_MAX"
            :invalid="!!fields.topic"
            fluid
          />
          <small v-if="fields.topic" class="iot-field-error">{{ fields.topic }}</small>
        </div>
        <div v-if="trajectories.length > 0" class="iot-field">
          <label id="consultation-trajectory-label" for="consultation-trajectory">
            ИОТ (необязательно)
          </label>
          <Select
            v-model="trajectory"
            input-id="consultation-trajectory"
            aria-labelledby="consultation-trajectory-label"
            :options="trajectories"
            option-label="disciplineName"
            option-value="id"
            placeholder="Без привязки к ИОТ"
            show-clear
            fluid
          />
        </div>
      </template>
      <div class="consultation-form__when">
        <div class="iot-field">
          <label for="consultation-date">Дата</label>
          <DateInput
            v-model="date"
            input-id="consultation-date"
            :invalid="!!fields.scheduledAt"
            fluid
          />
          <small v-if="fields.scheduledAt" class="iot-field-error">{{ fields.scheduledAt }}</small>
        </div>
        <div class="iot-field">
          <label for="consultation-time">Время</label>
          <InputText
            id="consultation-time"
            v-model="time"
            placeholder="чч:мм"
            inputmode="numeric"
            maxlength="5"
            :invalid="!!fields.time"
            aria-describedby="consultation-time-hint"
            fluid
          />
          <small id="consultation-time-hint" class="iot-field-hint">Например, 14:30</small>
          <small v-if="fields.time" class="iot-field-error">{{ fields.time }}</small>
        </div>
      </div>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" icon="pi pi-check" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.consultation-form__when {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--iot-space-3);
}

@media (max-width: 479px) {
  .consultation-form__when {
    grid-template-columns: 1fr;
  }
}
</style>
