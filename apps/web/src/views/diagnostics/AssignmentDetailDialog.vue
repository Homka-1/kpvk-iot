<script setup lang="ts">
import type {
  DiagnosticAssignmentDetailDto,
  DiagnosticForm,
  DiagnosticSessionRowDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import { useAction } from '@/views/disciplines/useList';
import AnswersFormDialog from './AnswersFormDialog.vue';
import { assignmentBadge, formatDuration, periodText, sessionBadge } from './sessions';

/**
 * Назначение и прохождения студентов: статус, время прохождения, ввод бумажного бланка (FR-022),
 * отмена назначения. Результаты по шкалам — во вкладке «Диагностика» профиля студента.
 */
const props = defineProps<{ assignmentId: string | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ changed: [] }>();

/** Бланк можно ввести и после окончания срока: бумажные бланки собирают позже. */
const PAPER_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'EXPIRED'];

const detail = ref<DiagnosticAssignmentDetailDto | null>(null);
const error = ref<string | null>(null);
const paperOpen = ref(false);
const paperSession = ref<DiagnosticSessionRowDto | null>(null);
const paperForm = ref<DiagnosticForm | null>(null);
const cancelOpen = ref(false);
const action = useAction();

async function load(): Promise<void> {
  if (!props.assignmentId) return;
  error.value = null;
  try {
    detail.value = await api<DiagnosticAssignmentDetailDto>(
      `/diagnostic-assignments/${props.assignmentId}`,
    );
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить назначение';
  }
}

watch(visible, (open) => {
  if (open) {
    detail.value = null;
    void load();
  }
});

async function enterPaper(session: DiagnosticSessionRowDto): Promise<void> {
  paperSession.value = session;
  paperForm.value = null;
  paperOpen.value = true;
  try {
    paperForm.value = await api<DiagnosticForm>(`/diagnostic-sessions/${session.id}/form`);
  } catch (caught) {
    paperOpen.value = false;
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить методику';
  }
}

function onChanged(): void {
  void load();
  emit('changed');
}

async function cancel(reason: string): Promise<void> {
  if (!detail.value) return;
  const id = detail.value.id;
  const ok = await action.run(() =>
    api(`/diagnostic-assignments/${id}/cancel`, { method: 'POST', body: { reason } }),
  );
  if (ok) {
    cancelOpen.value = false;
    onChanged();
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Прохождения диагностики"
    :style="{ width: '56rem' }"
    :breakpoints="{ '900px': '95vw' }"
  >
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!detail" role="status">Загрузка…</p>
    <div v-else class="detail">
      <div class="detail__head">
        <h2 class="detail__title">{{ detail.questionnaire.title }}</h2>
        <StatusBadge v-bind="assignmentBadge(detail.state)" />
      </div>
      <p class="detail__muted">
        Версия {{ detail.questionnaire.versionNumber }} ·
        {{ periodText(detail.startsAt, detail.endsAt) }} · назначил(а)
        {{ detail.assignedBy.fullName }}
      </p>
      <ul class="detail__sessions">
        <li v-for="session in detail.sessions" :key="session.id" class="detail__session">
          <div class="detail__student">
            <RouterLink :to="{ name: 'student-details', params: { id: session.student.id } }">
              {{ session.student.fullName }}
            </RouterLink>
            <span class="detail__muted">{{ session.student.participantCode }}</span>
          </div>
          <StatusBadge v-bind="sessionBadge(session.status)" />
          <span v-if="session.status === 'COMPLETED'" class="detail__muted">
            {{ formatDateTime(session.completedAt) }} ·
            {{
              session.source === 'PAPER'
                ? 'бумажный бланк'
                : formatDuration(session.durationSeconds)
            }}
          </span>
          <Button
            v-if="PAPER_STATUSES.includes(session.status) && !detail.cancelledAt"
            label="Ввести бланк"
            icon="pi pi-file-edit"
            size="small"
            text
            @click="enterPaper(session)"
          />
        </li>
      </ul>
      <p v-if="detail.sessions.length === 0" class="detail__muted">Нет доступных прохождений.</p>
      <div class="iot-form-buttons">
        <Button
          v-if="!detail.cancelledAt"
          label="Отменить назначение"
          icon="pi pi-ban"
          severity="danger"
          text
          @click="cancelOpen = true"
        />
        <Button label="Закрыть" severity="secondary" @click="visible = false" />
      </div>
    </div>

    <AnswersFormDialog
      v-if="paperSession"
      v-model:visible="paperOpen"
      mode="paper"
      :session-id="paperSession.id"
      :student-name="paperSession.student.fullName"
      :form="paperForm"
      @saved="onChanged"
    />
    <ActionDialog
      v-model:visible="cancelOpen"
      title="Отмена назначения"
      message="Незавершённые прохождения будут отменены. Уже полученные результаты сохранятся."
      confirm-label="Отменить назначение"
      require-reason
      danger
      :busy="action.busy.value"
      :error="action.error.value"
      @confirm="cancel"
    />
  </Dialog>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.detail__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.detail__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.0625rem;
  overflow-wrap: anywhere;
}

.detail__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.detail__sessions {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.detail__session {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-1) var(--iot-space-3);
  padding: var(--iot-space-2) 0;
  border-bottom: 1px solid var(--iot-color-border);
}

.detail__student {
  display: flex;
  flex: 1 1 14rem;
  flex-direction: column;
  min-width: 0;
}
</style>
