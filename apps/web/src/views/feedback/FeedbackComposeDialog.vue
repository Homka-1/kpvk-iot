<script setup lang="ts">
import {
  type CabinetFeedbackTrajectoryDto,
  DATED_FEEDBACK_KINDS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_TEXT_MAX,
  type FeedbackDto,
  FeedbackKind,
  type StudentSupportDto,
  TEACHER_FEEDBACK_KINDS,
  todayIsoDate,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import type { StudentOption } from './content';

/**
 * Сообщение преподавателя студенту (п. 4.9): рекомендация, комментарий, краткосрочная цель
 * или запрос самооценки — с привязкой к ИОТ, этапу или заданию (FR-064). Рекомендацию
 * и комментарий можно сохранить внутренней заметкой: студент её не увидит (FR-068).
 */
const props = withDefaults(
  defineProps<{
    /** Студент задан (профиль, проверка задания) — выбора нет. */
    studentId?: string | null;
    /** Студенты для выбора (раздел «Обратная связь»). */
    students?: StudentOption[];
    /** Маршруты заданного студента; иначе загружаются после выбора. */
    trajectories?: CabinetFeedbackTrajectoryDto[] | null;
    /** Привязка к заданию (страница проверки задания). */
    assignment?: { id: string; title: string } | null;
    /** Вид по умолчанию. */
    initialKind?: FeedbackKind;
  }>(),
  {
    studentId: null,
    students: () => [],
    trajectories: null,
    assignment: null,
    initialKind: FeedbackKind.RECOMMENDATION,
  },
);
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [item: FeedbackDto] }>();

const student = ref<string | null>(null);
const kind = ref<FeedbackKind>(props.initialKind);
const visibility = ref<'STUDENT_VISIBLE' | 'INTERNAL'>('STUDENT_VISIBLE');
const trajectoryId = ref<string | null>(null);
const stageId = ref<string | null>(null);
const dueDate = ref('');
const body = ref('');
const loaded = ref<CabinetFeedbackTrajectoryDto[]>([]);
const fields = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

const kindOptions = TEACHER_FEEDBACK_KINDS.map((value) => ({
  value,
  label: FEEDBACK_KIND_LABELS[value],
}));
const canBeInternal = computed(
  () => kind.value === FeedbackKind.RECOMMENDATION || kind.value === FeedbackKind.COMMENT,
);
const dated = computed(() => DATED_FEEDBACK_KINDS.includes(kind.value));
const trajectoryOptions = computed(() => props.trajectories ?? loaded.value);
const stageOptions = computed(
  () =>
    trajectoryOptions.value
      .find((item) => item.id === trajectoryId.value)
      ?.stages.map((stage) => ({
        value: stage.id,
        label: `Этап ${stage.sortOrder + 1}. ${stage.title}`,
      })) ?? [],
);

watch(visible, (open) => {
  if (!open) return;
  student.value = props.studentId;
  kind.value = props.initialKind;
  visibility.value = 'STUDENT_VISIBLE';
  trajectoryId.value = null;
  stageId.value = null;
  dueDate.value = '';
  body.value = '';
  fields.value = {};
  error.value = null;
  idempotencyKey = newIdempotencyKey();
});

watch(canBeInternal, (allowed) => {
  if (!allowed) visibility.value = 'STUDENT_VISIBLE';
});
watch(trajectoryId, () => {
  stageId.value = null;
});

// Маршруты выбранного студента — варианты привязки (FR-064).
watch(student, async (id) => {
  loaded.value = [];
  trajectoryId.value = null;
  if (!id || props.trajectories) return;
  try {
    loaded.value = (await api<StudentSupportDto>(`/students/${id}/support`)).trajectories;
  } catch {
    // Без списка маршрутов сообщение отправляется студенту в целом.
  }
});

async function send(): Promise<void> {
  const errors: Record<string, string> = {};
  if (!student.value) errors.studentId = 'Выберите студента';
  if (!body.value.trim()) errors.body = 'Напишите текст сообщения';
  if (dated.value && dueDate.value && dueDate.value < todayIsoDate()) {
    errors.dueDate = 'Срок не может быть в прошлом';
  }
  fields.value = errors;
  if (Object.keys(errors).length > 0) return;
  busy.value = true;
  error.value = null;
  try {
    const created = await api<FeedbackDto>('/feedback', {
      method: 'POST',
      body: {
        studentId: student.value,
        kind: kind.value,
        visibility: visibility.value,
        body: body.value.trim(),
        trajectoryAssignmentId: props.assignment?.id ?? null,
        trajectoryId: props.assignment ? null : trajectoryId.value,
        stageId: props.assignment ? null : stageId.value,
        dueDate: dated.value && dueDate.value ? dueDate.value : null,
      },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    visible.value = false;
    emit('created', created);
  } catch (caught) {
    if (caught instanceof ApiError) {
      error.value = caught.message;
      fields.value = caught.fields;
    } else {
      error.value = 'Не удалось отправить сообщение';
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
    header="Сообщение студенту"
    :style="{ width: '36rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="send">
      <div v-if="!studentId" class="iot-field">
        <label id="compose-student-label" for="compose-student">Студент</label>
        <Select
          v-model="student"
          input-id="compose-student"
          aria-labelledby="compose-student-label"
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
        <label id="compose-kind-label" for="compose-kind">Вид сообщения</label>
        <Select
          v-model="kind"
          input-id="compose-kind"
          aria-labelledby="compose-kind-label"
          :options="kindOptions"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <fieldset v-if="canBeInternal" class="compose__visibility">
        <legend class="iot-field__label">Кому видно</legend>
        <div class="compose__radio">
          <RadioButton v-model="visibility" input-id="compose-visible" value="STUDENT_VISIBLE" />
          <label for="compose-visible">Студенту — он получит уведомление</label>
        </div>
        <div class="compose__radio">
          <RadioButton v-model="visibility" input-id="compose-internal" value="INTERNAL" />
          <label for="compose-internal">Только преподавателям — внутренняя заметка</label>
        </div>
        <small v-if="fields.visibility" class="iot-field-error">{{ fields.visibility }}</small>
      </fieldset>
      <p v-if="assignment" class="compose__binding">
        <i class="pi pi-link" aria-hidden="true" /> Задание «{{ assignment.title }}»
      </p>
      <template v-else-if="trajectoryOptions.length > 0">
        <div class="iot-field">
          <label id="compose-trajectory-label" for="compose-trajectory">ИОТ (необязательно)</label>
          <Select
            v-model="trajectoryId"
            input-id="compose-trajectory"
            aria-labelledby="compose-trajectory-label"
            :options="trajectoryOptions"
            option-label="disciplineName"
            option-value="id"
            placeholder="Студент в целом"
            show-clear
            fluid
          />
          <small v-if="fields.trajectoryId" class="iot-field-error">{{
            fields.trajectoryId
          }}</small>
        </div>
        <div v-if="trajectoryId" class="iot-field">
          <label id="compose-stage-label" for="compose-stage">Этап (необязательно)</label>
          <Select
            v-model="stageId"
            input-id="compose-stage"
            aria-labelledby="compose-stage-label"
            :options="stageOptions"
            option-label="label"
            option-value="value"
            placeholder="Маршрут в целом"
            show-clear
            fluid
          />
          <small v-if="fields.stageId" class="iot-field-error">{{ fields.stageId }}</small>
        </div>
      </template>
      <div v-if="dated" class="iot-field">
        <label for="compose-due">
          {{ kind === 'SHORT_TERM_GOAL' ? 'Срок цели' : 'Ответить до' }} (необязательно)
        </label>
        <DateInput v-model="dueDate" input-id="compose-due" :invalid="!!fields.dueDate" fluid />
        <small v-if="fields.dueDate" class="iot-field-error">{{ fields.dueDate }}</small>
      </div>
      <div class="iot-field">
        <label for="compose-body">Текст</label>
        <Textarea
          id="compose-body"
          v-model="body"
          rows="5"
          :maxlength="FEEDBACK_TEXT_MAX"
          :invalid="!!fields.body"
          aria-describedby="compose-body-error"
          fluid
        />
        <small v-if="fields.body" id="compose-body-error" class="iot-field-error">
          {{ fields.body }}
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
.compose__visibility {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.compose__visibility legend {
  margin-bottom: var(--iot-space-1);
}

.compose__radio {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.compose__binding {
  display: flex;
  align-items: center;
  gap: var(--iot-space-1);
  color: var(--iot-color-muted);
}
</style>
