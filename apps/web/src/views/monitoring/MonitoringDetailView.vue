<script setup lang="ts">
import {
  CHECKPOINT_STATUS_LABELS,
  type CheckpointStatus,
  type DiagnosticComparisonDto,
  type MonitoringDetailDto,
  Permission,
  type SupportStatus,
  type TrajectoryDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import DateInput from '@/components/DateInput.vue';
import ErrorState from '@/components/ErrorState.vue';
import MetricCard from '@/components/MetricCard.vue';
import ProgressIndicator from '@/components/ProgressIndicator.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import DiagnosticComparison from '@/views/diagnostics/DiagnosticComparison.vue';
import { supportBadge, trajectoryBadge } from '@/views/students/labels';
import { checkpointBadge, stageBadge } from '@/views/trajectories/content';
import { rowFacts, warningBadge, warningDue } from './content';
import DynamicsCharts from './DynamicsCharts.vue';
import SupportStatusDialog from './SupportStatusDialog.vue';

/**
 * Мониторинг одной ИОТ (UC-05: «Мониторинг» → затруднения студента → задания, диагностика,
 * история сопровождения → корректировка). Показатели и предупреждения, этапы с контрольными
 * точками (отметка «Пройдена»/«Пропущена»), учебная активность и успешность, отдельно —
 * диагностика (FR-062), версии маршрута, отметка о сопровождении (FR-060) и переход к
 * корректировке (FR-061).
 */
const route = useRoute();
const auth = useAuthStore();
const id = computed(() => String(route.params.id));
const canCorrect = computed(
  () =>
    auth.hasPermission(Permission.TRAJECTORIES_MANAGE) &&
    auth.hasPermission(Permission.TRAJECTORIES_APPROVE),
);
const canManage = computed(() => auth.hasPermission(Permission.TRAJECTORIES_MANAGE));

const data = ref<MonitoringDetailDto | null>(null);
const comparisons = ref<DiagnosticComparisonDto[] | null>(null);
const diagnosticsError = ref<string | null>(null);
const loadError = ref<string | null>(null);
const from = ref('');
const to = ref('');
const notice = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busy = ref(false);
const supportOpen = ref(false);
const correctionOpen = ref(false);

const open = computed(
  () => data.value?.row.status === 'ACTIVE' || data.value?.row.status === 'NEEDS_CORRECTION',
);

async function load(): Promise<void> {
  loadError.value = null;
  if (from.value && to.value && to.value < from.value) {
    loadError.value = 'Конец периода раньше начала';
    return;
  }
  try {
    data.value = await api<MonitoringDetailDto>(`/monitoring/trajectories/${id.value}`, {
      query: { from: from.value, to: to.value },
    });
  } catch (caught) {
    loadError.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить данные';
    return;
  }
  if (comparisons.value === null) void loadDiagnostics(data.value.row.student.id);
}

async function loadDiagnostics(studentId: string): Promise<void> {
  diagnosticsError.value = null;
  try {
    comparisons.value = await api<DiagnosticComparisonDto[]>(
      `/students/${studentId}/diagnostics/comparison`,
    );
  } catch (caught) {
    diagnosticsError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось загрузить диагностику';
  }
}

watch(id, () => {
  data.value = null;
  comparisons.value = null;
  void load();
});
watch([from, to], () => void load());
void load();

function onSupportSaved(status: SupportStatus): void {
  if (data.value) data.value.row.student.supportStatus = status;
  notice.value = 'Статус сопровождения сохранён.';
}

async function markCheckpoint(checkpointId: string, status: CheckpointStatus): Promise<void> {
  busy.value = true;
  actionError.value = null;
  try {
    await api<TrajectoryDto>(`/trajectories/${id.value}/checkpoints/${checkpointId}/status`, {
      method: 'POST',
      body: { status },
    });
    notice.value = `Контрольная точка: «${CHECKPOINT_STATUS_LABELS[status]}».`;
    await load();
  } catch (caught) {
    actionError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось сохранить отметку';
  } finally {
    busy.value = false;
  }
}

async function markNeedsCorrection(reason: string): Promise<void> {
  busy.value = true;
  actionError.value = null;
  try {
    const trajectory = await api<TrajectoryDto>(`/trajectories/${id.value}`);
    await api<TrajectoryDto>(`/trajectories/${id.value}/needs-correction`, {
      method: 'POST',
      body: { updatedAt: trajectory.updatedAt, reason },
    });
    correctionOpen.value = false;
    notice.value = 'ИОТ отмечена: «Требует корректировки».';
    await load();
  } catch (caught) {
    actionError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось сохранить отметку';
  } finally {
    busy.value = false;
  }
}

const percent = (value: number) => `${formatNumber(value)} %`;
</script>

<template>
  <div class="iot-page detail">
    <RouterLink to="/monitoring" class="detail__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> Мониторинг
    </RouterLink>
    <ErrorState v-if="loadError && !data" :message="loadError" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <template v-else>
      <div class="detail__heading">
        <h1>{{ data.row.student.fullName }} · {{ data.row.discipline.name }}</h1>
        <StatusBadge v-bind="trajectoryBadge(data.row.status)" />
        <StatusBadge v-bind="supportBadge(data.row.student.supportStatus)" />
      </div>
      <p class="detail__muted">
        {{ data.row.student.group?.name ?? 'Без группы' }} · код
        {{ data.row.student.participantCode }} · версия маршрута {{ data.row.version }}
      </p>
      <Message v-if="notice" severity="success" role="status" @close="notice = null">
        {{ notice }}
      </Message>
      <Message v-if="actionError" severity="error" role="alert" @close="actionError = null">
        {{ actionError }}
      </Message>

      <section class="iot-card detail__actions" aria-label="Действия">
        <RouterLink
          v-if="open && canCorrect"
          :to="{ name: 'trajectory-details', params: { id }, query: { correct: '1' } }"
          class="p-button"
        >
          <i class="pi pi-pencil" aria-hidden="true" />&nbsp;Корректировать ИОТ
        </RouterLink>
        <Button
          v-if="data.row.status === 'ACTIVE' && canManage"
          label="Отметить «Требует корректировки»"
          icon="pi pi-exclamation-triangle"
          severity="secondary"
          outlined
          @click="correctionOpen = true"
        />
        <Button
          label="Статус сопровождения"
          icon="pi pi-user-plus"
          severity="secondary"
          outlined
          @click="supportOpen = true"
        />
        <RouterLink :to="`/trajectories/${id}`" class="p-button p-button-text"
          >Карта ИОТ</RouterLink
        >
        <RouterLink
          :to="`/students/${data.row.student.id}?tab=assignments`"
          class="p-button p-button-text"
        >
          Задания студента
        </RouterLink>
        <RouterLink
          :to="`/students/${data.row.student.id}?tab=support`"
          class="p-button p-button-text"
        >
          История сопровождения
        </RouterLink>
      </section>

      <div class="detail__period" role="group" aria-label="Период">
        <div class="iot-field">
          <label for="detail-from">Период с</label>
          <DateInput v-model="from" input-id="detail-from" />
        </div>
        <div class="iot-field">
          <label for="detail-to">по</label>
          <DateInput v-model="to" input-id="detail-to" :invalid="!!loadError" />
        </div>
        <small v-if="loadError" class="iot-field-error" role="alert">{{ loadError }}</small>
      </div>

      <section class="detail__metrics" aria-label="Показатели">
        <MetricCard
          label="Прогресс ИОТ"
          :value="data.row.progress.percent"
          unit="%"
          icon="pi pi-percentage"
          hint="Доля выполненных заданий"
        />
        <MetricCard
          label="Средний результат"
          :value="data.row.averageScore"
          unit="%"
          icon="pi pi-star"
          hint="Оценённые задания за период"
        />
        <MetricCard
          label="Обращения за помощью"
          :value="data.row.helpRequests"
          icon="pi pi-question-circle"
        />
        <MetricCard label="Корректировки" :value="data.row.corrections" icon="pi pi-history" />
      </section>
      <section class="iot-card">
        <dl class="detail__facts">
          <div v-for="fact in rowFacts(data.row)" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="iot-card" aria-labelledby="detail-warnings">
        <h2 id="detail-warnings" class="detail__title">Предупреждения</h2>
        <p v-if="data.warnings.length === 0" class="detail__muted">
          Просроченных заданий и пропущенных контрольных точек нет.
        </p>
        <ul v-else class="detail__list">
          <li v-for="(warning, index) in data.warnings" :key="index">
            <StatusBadge v-bind="warningBadge(warning)" />
            <span>
              <template v-if="warning.stageTitle">Этап «{{ warning.stageTitle }}» · </template>
              {{ warning.title }} · срок {{ warningDue(warning) }}
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="detail-stages" class="detail__stages">
        <h2 id="detail-stages" class="detail__title">Выполнение этапов</h2>
        <article
          v-for="(stage, index) in data.stages"
          :key="stage.id"
          class="iot-card detail__stage"
          :aria-label="`Этап ${index + 1}: ${stage.title}`"
        >
          <div class="detail__stage-head">
            <h3>{{ index + 1 }}. {{ stage.title }}</h3>
            <StatusBadge v-bind="stageBadge(stage.status)" />
          </div>
          <p class="detail__muted">
            {{ formatDate(stage.startDate) }} – {{ formatDate(stage.endDate) }}
          </p>
          <ProgressIndicator
            :label="
              stage.progress.total
                ? `Задания: выполнено ${stage.progress.completed} из ${stage.progress.total}`
                : 'Заданий в этапе нет'
            "
            :value="stage.progress.percent"
          />
          <ul v-if="stage.checkpoints.length" class="detail__list">
            <li v-for="checkpoint in stage.checkpoints" :key="checkpoint.id">
              <StatusBadge
                v-if="checkpoint.missed && checkpoint.status === 'PENDING'"
                label="Срок прошёл"
                tone="warning"
              />
              <StatusBadge v-else v-bind="checkpointBadge(checkpoint.status)" />
              <span class="detail__grow">
                {{ checkpoint.title }} · {{ formatDate(checkpoint.dueDate) }}
              </span>
              <template v-if="open && canManage">
                <Button
                  v-if="checkpoint.status !== 'PASSED'"
                  label="Пройдена"
                  icon="pi pi-check"
                  size="small"
                  outlined
                  :disabled="busy"
                  :aria-label="`Отметить пройденной: ${checkpoint.title}`"
                  @click="markCheckpoint(checkpoint.id, 'PASSED')"
                />
                <Button
                  v-if="checkpoint.status !== 'MISSED'"
                  label="Пропущена"
                  icon="pi pi-times"
                  size="small"
                  severity="secondary"
                  outlined
                  :disabled="busy"
                  :aria-label="`Отметить пропущенной: ${checkpoint.title}`"
                  @click="markCheckpoint(checkpoint.id, 'MISSED')"
                />
              </template>
            </li>
          </ul>
          <p v-else class="detail__muted">Контрольная точка не задана</p>
        </article>
      </section>

      <section class="iot-card" aria-labelledby="detail-activity">
        <h2 id="detail-activity" class="detail__title">Учебная активность и успешность</h2>
        <DynamicsCharts :points="data.dynamics" />
        <h3 class="detail__subtitle">Оценённые задания</h3>
        <p v-if="data.results.length === 0" class="detail__muted">
          Нет данных: за период нет оценённых заданий.
        </p>
        <div v-else class="detail__scroll">
          <table class="detail__table">
            <thead>
              <tr>
                <th scope="col">Дата</th>
                <th scope="col">Задание</th>
                <th scope="col">Баллы</th>
                <th scope="col">Результат</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(result, index) in data.results" :key="index">
                <td>{{ formatDateTime(result.recordedAt) }}</td>
                <td>{{ result.title ?? 'Нет данных' }}</td>
                <td>{{ formatNumber(result.score) }} из {{ formatNumber(result.maxScore) }}</td>
                <td>{{ percent(result.percent) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="iot-card" aria-labelledby="detail-diagnostics">
        <h2 id="detail-diagnostics" class="detail__title">Психолого-педагогическая диагностика</h2>
        <p class="detail__muted">
          Учитывается отдельно от учебной активности: оценки и сдача заданий не меняют результаты
          диагностики.
        </p>
        <ErrorState v-if="diagnosticsError" :message="diagnosticsError" />
        <p v-else-if="comparisons === null" role="status">Загрузка…</p>
        <p v-else-if="comparisons.length === 0" class="detail__muted">
          Нет данных: студент ещё не проходил диагностику.
        </p>
        <div v-else class="detail__stages">
          <DiagnosticComparison
            v-for="comparison in comparisons"
            :key="comparison.questionnaireId"
            :comparison="comparison"
          />
        </div>
      </section>

      <section class="iot-card" aria-labelledby="detail-versions">
        <h2 id="detail-versions" class="detail__title">Версии маршрута</h2>
        <ul class="detail__versions">
          <li v-for="version in data.versions" :key="version.versionNumber">
            Версия {{ version.versionNumber }} · {{ formatDateTime(version.createdAt) }} ·
            {{ version.createdBy?.fullName ?? 'Нет данных' }}
            <template v-if="version.reason"> · причина: {{ version.reason }}</template>
          </li>
        </ul>
      </section>

      <SupportStatusDialog
        v-model:visible="supportOpen"
        :student-id="data.row.student.id"
        :current="data.row.student.supportStatus"
        @saved="onSupportSaved"
      />
      <ActionDialog
        v-model:visible="correctionOpen"
        title="Требует корректировки"
        message="Маршрут будет отмечен как требующий корректировки. Затем откройте «Корректировать ИОТ» и утвердите новую версию."
        confirm-label="Отметить"
        require-reason
        :busy="busy"
        :error="actionError"
        @confirm="markNeedsCorrection"
      />
    </template>
  </div>
</template>

<style scoped>
.detail,
.detail__stages {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.detail__back {
  align-self: flex-start;
}

.detail__heading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.detail__heading h1 {
  margin: 0;
  font-size: 1.375rem;
  overflow-wrap: anywhere;
}

.detail__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.0625rem;
}

.detail__subtitle {
  margin: var(--iot-space-3) 0 var(--iot-space-2);
  font-size: 1rem;
}

.detail__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.detail__actions,
.detail__period {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: flex-end;
}

.detail__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: var(--iot-space-3);
}

.detail__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
}

.detail__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}

.detail__facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.detail__stage {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.detail__stage-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  justify-content: space-between;
}

.detail__stage-head h3 {
  margin: 0;
  font-size: 1rem;
}

.detail__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.detail__list li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  overflow-wrap: anywhere;
}

.detail__grow {
  flex: 1 1 200px;
}

.detail__scroll {
  overflow-x: auto;
}

.detail__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.detail__table th,
.detail__table td {
  padding: var(--iot-space-1) var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
}

.detail__versions {
  margin: 0;
  padding-left: var(--iot-space-4);
}
</style>
