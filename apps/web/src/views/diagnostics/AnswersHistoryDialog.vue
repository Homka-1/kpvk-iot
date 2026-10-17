<script setup lang="ts">
import {
  DIAGNOSTIC_REVISION_KIND_LABELS,
  type DiagnosticAnswersDto,
  Permission,
  type StudentDiagnosticDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';
import AnswersFormDialog from './AnswersFormDialog.vue';
import ScoresTable from './ScoresTable.vue';
import { formatAnswer } from './sessions';

/**
 * Исходные ответы прохождения и все ревизии результатов (FR-013, FR-023). Доступно только
 * с разрешением на диагностические ответы — его проверяет сервер (п. 2.1 ТЗ).
 * Исправление ошибочного ввода создаёт новую ревизию; прежние остаются в истории.
 */
const props = defineProps<{ sessionId: string | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ corrected: [result: StudentDiagnosticDto] }>();
const auth = useAuthStore();
const canCorrect = computed(() => auth.hasPermission(Permission.DIAGNOSTICS_MANAGE));

const data = ref<DiagnosticAnswersDto | null>(null);
const error = ref<string | null>(null);
const correctionOpen = ref(false);

async function load(): Promise<void> {
  if (!props.sessionId) return;
  error.value = null;
  try {
    data.value = await api<DiagnosticAnswersDto>(`/diagnostic-sessions/${props.sessionId}/answers`);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить ответы';
  }
}

watch(visible, (open) => {
  if (open) {
    data.value = null;
    void load();
  }
});

function onCorrected(result: StudentDiagnosticDto): void {
  void load();
  emit('corrected', result);
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Ответы и ревизии результатов"
    :style="{ width: '52rem' }"
    :breakpoints="{ '860px': '95vw' }"
  >
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <div v-else class="history">
      <div class="history__head">
        <h2 class="history__title">{{ data.form.title }}</h2>
        <Button
          v-if="canCorrect"
          label="Исправить ошибочный ввод"
          icon="pi pi-pencil"
          size="small"
          outlined
          @click="correctionOpen = true"
        />
      </div>
      <p class="history__muted">{{ data.student.fullName }} · {{ data.student.participantCode }}</p>
      <section
        v-for="(revision, index) in data.revisions"
        :key="revision.revision"
        class="iot-card history__revision"
        :aria-labelledby="`revision-${revision.revision}`"
      >
        <div class="history__head">
          <h3 :id="`revision-${revision.revision}`" class="history__subtitle">
            Ревизия {{ revision.revision }} · {{ DIAGNOSTIC_REVISION_KIND_LABELS[revision.kind] }}
          </h3>
          <StatusBadge v-if="index === 0" label="Действующая" tone="success" />
          <StatusBadge v-else label="Заменена исправлением" tone="neutral" icon="pi pi-history" />
        </div>
        <p class="history__muted">
          {{ formatDateTime(revision.createdAt) }}
          <template v-if="revision.createdBy"> · {{ revision.createdBy.fullName }}</template>
        </p>
        <p v-if="revision.reason">Причина: {{ revision.reason }}</p>
        <ScoresTable :scores="revision.scores" :caption="`Баллы ревизии ${revision.revision}`" />
        <details>
          <summary>Ответы</summary>
          <dl class="history__answers">
            <div v-for="(question, number) in data.form.questions" :key="question.key">
              <dt>{{ number + 1 }}. {{ question.text }}</dt>
              <dd>{{ formatAnswer(question, revision.answers[question.key]) }}</dd>
            </div>
          </dl>
        </details>
      </section>
      <div class="iot-form-buttons">
        <Button label="Закрыть" severity="secondary" @click="visible = false" />
      </div>
    </div>

    <AnswersFormDialog
      v-if="data && sessionId"
      v-model:visible="correctionOpen"
      mode="correction"
      :session-id="sessionId"
      :student-name="data.student.fullName"
      :form="data.form"
      :initial="data.revisions[0]?.answers"
      @saved="onCorrected"
    />
  </Dialog>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.history p {
  margin: 0;
}

.history__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.history__title,
.history__subtitle {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.0625rem;
  overflow-wrap: anywhere;
}

.history__subtitle {
  font-size: 1rem;
}

.history__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.history__revision {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.history__answers {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: var(--iot-space-2) 0 0;
}

.history__answers dt {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.history__answers dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
