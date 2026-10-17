<script setup lang="ts">
import {
  type AnswerValue,
  answersIssues,
  CORRECTION_REASON_MAX,
  correctionReasonSchema,
  type DiagnosticForm,
  localDayStart,
  type StudentDiagnosticDto,
  todayIsoDate,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import QuestionField from '@/components/QuestionField.vue';

/**
 * Ввод ответов преподавателем: бумажный бланк (FR-022) или исправление ошибочного ввода
 * завершённого прохождения (FR-013). Исправление создаёт новую ревизию с причиной; прежние
 * ответы и баллы сохраняются. Проверка ответов — те же правила, что на сервере.
 */
const props = defineProps<{
  mode: 'paper' | 'correction';
  sessionId: string;
  studentName: string;
  form: DiagnosticForm | null;
  /** Ответы, с которых начинается исправление (действующая ревизия). */
  initial?: Record<string, AnswerValue>;
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [result: StudentDiagnosticDto] }>();

const answers = reactive<Record<string, AnswerValue>>({});
const completedOn = ref(todayIsoDate());
const reason = ref('');
const fieldErrors = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

const title = computed(() =>
  props.mode === 'paper' ? 'Ввод бумажного бланка' : 'Исправление ошибочного ввода',
);

watch(visible, (open) => {
  if (!open) return;
  for (const key of Object.keys(answers)) delete answers[key];
  Object.assign(answers, structuredClone(props.initial ?? {}));
  completedOn.value = todayIsoDate();
  reason.value = '';
  fieldErrors.value = {};
  error.value = null;
  idempotencyKey = newIdempotencyKey();
});

/** Дата заполнения бланка: полдень выбранного дня, но не позже текущего момента. */
function completedAt(): string {
  const noon = localDayStart(completedOn.value).getTime() + 12 * 60 * 60 * 1000;
  return new Date(Math.min(noon, Date.now())).toISOString();
}

async function submit(): Promise<void> {
  if (!props.form) return;
  const issues = answersIssues(props.form.questions, answers, true);
  if (props.mode === 'paper' && (!completedOn.value || completedOn.value > todayIsoDate())) {
    issues.completedAt = 'Укажите дату заполнения бланка, не позже сегодняшней';
  }
  if (props.mode === 'correction') {
    const parsed = correctionReasonSchema.safeParse(reason.value);
    if (!parsed.success) issues.reason = parsed.error.issues[0]!.message;
  }
  fieldErrors.value = issues;
  if (Object.keys(issues).length > 0) {
    error.value = 'Проверьте ответы и заполните обязательные поля';
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const result = await api<StudentDiagnosticDto>(
      `/diagnostic-sessions/${props.sessionId}/${props.mode === 'paper' ? 'paper' : 'corrections'}`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body:
          props.mode === 'paper'
            ? { answers, completedAt: completedAt() }
            : { answers, reason: reason.value.trim() },
      },
    );
    emit('saved', result);
    visible.value = false;
  } catch (caught) {
    if (caught instanceof ApiError) fieldErrors.value = caught.fields;
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось сохранить ответы';
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
    :style="{ width: '48rem' }"
    :breakpoints="{ '800px': '95vw' }"
  >
    <form class="answers-form" novalidate @submit.prevent="submit">
      <p class="answers-form__note" role="note">
        <i class="pi pi-info-circle" aria-hidden="true" />
        <template v-if="mode === 'paper'">
          Студент: {{ studentName }}. Перенесите ответы с бланка. Баллы рассчитаются по утверждённым
          ключам методики.
        </template>
        <template v-else>
          Студент: {{ studentName }}. Будет создана новая ревизия результатов. Прежние ответы и
          баллы сохранятся в истории, причина попадёт в журнал аудита.
        </template>
      </p>
      <p v-if="!form" role="status">Загрузка…</p>
      <template v-else>
        <h2 class="answers-form__title">{{ form.title }}</h2>
        <div v-if="mode === 'paper'" class="iot-field">
          <label for="paper-date">Дата заполнения бланка</label>
          <InputText
            id="paper-date"
            v-model="completedOn"
            type="date"
            :max="todayIsoDate()"
            :invalid="!!fieldErrors.completedAt"
            fluid
          />
          <small v-if="fieldErrors.completedAt" class="iot-field-error">
            {{ fieldErrors.completedAt }}
          </small>
        </div>
        <ol class="answers-form__questions">
          <li v-for="(question, index) in form.questions" :key="question.key">
            <QuestionField
              v-model="answers[question.key]"
              :question="question"
              :number="index + 1"
              :id-prefix="`answers-${mode}`"
              :error="fieldErrors[`answers.${question.key}`]"
            />
          </li>
        </ol>
        <div v-if="mode === 'correction'" class="iot-field">
          <label for="correction-reason">Причина исправления</label>
          <Textarea
            id="correction-reason"
            v-model="reason"
            rows="3"
            :maxlength="CORRECTION_REASON_MAX"
            :invalid="!!fieldErrors.reason"
            fluid
          />
          <small v-if="fieldErrors.reason" class="iot-field-error">{{ fieldErrors.reason }}</small>
        </div>
      </template>
      <Message v-if="error" severity="error" role="alert">
        {{ error }}
        <template v-if="fieldErrors.answers"> {{ fieldErrors.answers }}</template>
      </Message>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" @click="visible = false" />
        <Button
          type="submit"
          :label="mode === 'paper' ? 'Сохранить результаты' : 'Сохранить исправление'"
          :loading="busy"
          :disabled="!form"
        />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.answers-form {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.answers-form p {
  margin: 0;
}

.answers-form__note {
  padding: var(--iot-space-2) var(--iot-space-3);
  border: 1px solid var(--iot-color-info-border);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-info-text);
}

.answers-form__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.0625rem;
}

.answers-form__questions {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
