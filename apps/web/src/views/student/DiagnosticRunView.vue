<script setup lang="ts">
import { type AnswerValue, answersIssues, type CabinetDiagnosticSessionDto } from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import ErrorState from '@/components/ErrorState.vue';
import QuestionField from '@/components/QuestionField.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import { periodText, sessionBadge } from '@/views/diagnostics/sessions';

/**
 * Прохождение диагностики студентом (UC-01, шаги 6–9): инструкция, вопросы, автосохранение
 * черновика (если его допускает методика) и восстановление после обрыва связи, проверка
 * полноты, подтверждение завершения. После завершения ответы не изменяются (FR-013).
 */
const AUTOSAVE_DELAY_MS = 1500;

const route = useRoute();
const sessionId = computed(() => String(route.params.id));
const session = ref<CabinetDiagnosticSessionDto | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const answers = reactive<Record<string, AnswerValue>>({});
const fieldErrors = ref<Record<string, string>>({});
const draftState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const savedAt = ref<string | null>(null);
const busy = ref(false);
const confirmOpen = ref(false);
let completeKey = newIdempotencyKey();
let timer: ReturnType<typeof setTimeout> | null = null;
let restoring = false;

const notStarted = computed(
  () => !!session.value?.startsAt && new Date(session.value.startsAt) > new Date(),
);
const answeredCount = computed(
  () =>
    session.value?.form.questions.filter((question) => {
      const value = answers[question.key];
      return value !== null && value !== undefined && value !== '';
    }).length ?? 0,
);

function apply(value: CabinetDiagnosticSessionDto): void {
  session.value = value;
  restoring = true;
  for (const key of Object.keys(answers)) delete answers[key];
  Object.assign(answers, value.draft ?? {});
  void nextTick(() => (restoring = false));
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    apply(await api<CabinetDiagnosticSessionDto>(`/cabinet/diagnostics/${sessionId.value}`));
  } catch (caught) {
    loadError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось открыть диагностику';
  }
}

watch(sessionId, () => void load(), { immediate: true });

async function start(): Promise<void> {
  busy.value = true;
  actionError.value = null;
  try {
    apply(
      await api<CabinetDiagnosticSessionDto>(`/cabinet/diagnostics/${sessionId.value}/start`, {
        method: 'POST',
      }),
    );
  } catch (caught) {
    actionError.value = caught instanceof ApiError ? caught.message : 'Не удалось начать';
  } finally {
    busy.value = false;
  }
}

async function saveDraft(): Promise<void> {
  if (!session.value?.form.allowDraft || session.value.status !== 'IN_PROGRESS') return;
  draftState.value = 'saving';
  try {
    const saved = await api<{ savedAt: string }>(`/cabinet/diagnostics/${sessionId.value}/draft`, {
      method: 'PUT',
      body: { answers },
    });
    savedAt.value = saved.savedAt;
    draftState.value = 'saved';
  } catch {
    // Черновик не сохранился (например, нет связи): ответы остаются на экране, повтор — при следующем изменении.
    draftState.value = 'error';
  }
}

watch(
  answers,
  () => {
    if (restoring || session.value?.status !== 'IN_PROGRESS') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveDraft(), AUTOSAVE_DELAY_MS);
  },
  { deep: true },
);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

function requestComplete(): void {
  if (!session.value) return;
  const issues = answersIssues(session.value.form.questions, answers, true);
  fieldErrors.value = issues;
  if (Object.keys(issues).length > 0) {
    actionError.value = 'Ответьте на все обязательные вопросы: они отмечены ниже';
    void nextTick(() =>
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center' }),
    );
    return;
  }
  actionError.value = null;
  confirmOpen.value = true;
}

async function complete(): Promise<void> {
  if (timer) clearTimeout(timer);
  busy.value = true;
  actionError.value = null;
  try {
    await api(`/cabinet/diagnostics/${sessionId.value}/complete`, {
      method: 'POST',
      headers: { 'Idempotency-Key': completeKey },
      body: { answers },
    });
    confirmOpen.value = false;
    completeKey = newIdempotencyKey();
    void load();
  } catch (caught) {
    confirmOpen.value = false;
    if (caught instanceof ApiError) fieldErrors.value = caught.fields;
    actionError.value = caught instanceof ApiError ? caught.message : 'Не удалось завершить';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="iot-page run">
    <RouterLink :to="{ name: 'student-diagnostics' }" class="run__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> Диагностика
    </RouterLink>
    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="!session" role="status">Загрузка…</p>
    <template v-else>
      <div class="run__head">
        <h1>{{ session.form.title }}</h1>
        <StatusBadge v-bind="sessionBadge(session.status)" />
      </div>
      <p class="run__muted">Срок: {{ periodText(session.startsAt, session.endsAt) }}</p>

      <section
        v-if="session.status === 'COMPLETED'"
        class="iot-card run__card"
        aria-labelledby="run-done"
      >
        <h2 id="run-done" class="run__title">
          <i class="pi pi-check-circle" aria-hidden="true" /> Диагностика пройдена
        </h2>
        <p class="run__muted">{{ formatDateTime(session.completedAt) }}. Спасибо за ответы!</p>
        <ul v-if="session.results.length" class="run__results">
          <li v-for="item in session.results" :key="item.scale">
            <strong>{{ item.scale }}.</strong> {{ item.text }}
          </li>
        </ul>
        <p v-else>Результаты обсудит с вами преподаватель.</p>
      </section>

      <Message v-else-if="session.status === 'EXPIRED'" severity="warn">
        Срок прохождения истёк. Если вы не успели, обратитесь к преподавателю.
      </Message>

      <template v-else>
        <section class="iot-card run__card" aria-labelledby="run-instruction">
          <h2 id="run-instruction" class="run__title">Инструкция</h2>
          <p class="run__instruction">
            {{ session.form.instruction ?? 'Ответьте на вопросы методики.' }}
          </p>
          <p class="run__muted">
            Вопросов: {{ session.form.questions.length }}.
            <template v-if="session.form.allowDraft">
              Ответы сохраняются автоматически: можно прерваться и продолжить позже.
            </template>
            <template v-else> Черновик не сохраняется: пройдите методику за один раз. </template>
          </p>
          <Message v-if="notStarted" severity="info">
            Прохождение станет доступно {{ formatDateTime(session.startsAt) }}.
          </Message>
          <div v-else-if="session.status === 'ASSIGNED'" class="iot-form-buttons">
            <Button label="Начать" icon="pi pi-play" :loading="busy" @click="start" />
          </div>
        </section>

        <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>

        <form
          v-if="session.status === 'IN_PROGRESS'"
          class="run__form"
          novalidate
          @submit.prevent="requestComplete"
        >
          <ol class="run__questions">
            <li v-for="(question, index) in session.form.questions" :key="question.key">
              <QuestionField
                v-model="answers[question.key]"
                :question="question"
                :number="index + 1"
                id-prefix="run"
                :error="fieldErrors[`answers.${question.key}`]"
              />
            </li>
          </ol>
          <div class="run__footer">
            <p class="run__muted" role="status" aria-live="polite">
              Отвечено: {{ answeredCount }} из {{ session.form.questions.length }}
              <template v-if="draftState === 'saving'"> · Сохранение черновика…</template>
              <template v-else-if="draftState === 'saved'">
                · Черновик сохранён {{ formatDateTime(savedAt) }}
              </template>
              <template v-else-if="draftState === 'error'">
                · Черновик не сохранён: проверьте подключение
              </template>
            </p>
            <Button type="submit" label="Завершить" icon="pi pi-check" :loading="busy" />
          </div>
        </form>
      </template>
    </template>

    <ActionDialog
      v-model:visible="confirmOpen"
      title="Завершение диагностики"
      message="После завершения изменить ответы будет нельзя. Завершить?"
      confirm-label="Завершить"
      :busy="busy"
      @confirm="complete"
    />
  </div>
</template>

<style scoped>
.run {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.run p {
  margin: 0;
}

.run__back {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-1);
  align-self: flex-start;
}

.run__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.run__head h1 {
  margin: 0;
  overflow-wrap: anywhere;
}

.run__card {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.run__title {
  margin: 0;
  font-size: 1.0625rem;
}

.run__instruction {
  white-space: pre-line;
}

.run__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.run__form {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.run__questions,
.run__results {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.run__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}
</style>
