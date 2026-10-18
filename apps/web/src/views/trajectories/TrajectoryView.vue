<script setup lang="ts">
import {
  Permission,
  TRAJECTORY_CORRECTABLE_STATUSES,
  TRAJECTORY_FINAL_ASSESSMENT_MAX,
  TRAJECTORY_STATUS_LABELS,
  type TrajectoryDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDate, formatDateTime } from '@/utils/format';
import { trajectoryBadge } from '@/views/students/labels';
import StageMap from './StageMap.vue';
import TrajectoryEditor from './TrajectoryEditor.vue';
import TrajectoryPassport from './TrajectoryPassport.vue';
import TrajectoryVersionDialog from './TrajectoryVersionDialog.vue';

/**
 * Страница ИОТ (п. 6.4): черновик открывается в конструкторе (UC-03), остальные статусы —
 * паспорт и карта этапов. Маршрут «На утверждении» утверждает или возвращает на доработку
 * преподаватель с правом утверждения (FR-039). Действующий маршрут корректируется новой версией
 * с причиной (UC-05, FR-043), отмечается «Требует корректировки» и завершается с итоговой
 * оценкой (FR-044); завершённый переносится в архив. История версий — с изменениями.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const canApprove = computed(() => auth.hasPermission(Permission.TRAJECTORIES_APPROVE));
const canMonitor = computed(() => auth.hasPermission(Permission.MONITORING_READ));
const id = computed(() => String(route.params.id));
const trajectory = ref<TrajectoryDto | null>(null);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);
const correcting = ref(false);

const correctable = computed(
  () => !!trajectory.value && TRAJECTORY_CORRECTABLE_STATUSES.includes(trajectory.value.status),
);

async function load(): Promise<void> {
  trajectory.value = null;
  loadError.value = null;
  try {
    trajectory.value = await api<TrajectoryDto>(`/trajectories/${id.value}`);
    // Переход «Корректировать ИОТ» из мониторинга (FR-061) сразу открывает корректировку.
    correcting.value = route.query.correct === '1' && correctable.value && canApprove.value;
  } catch (caught) {
    loadError.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить ИОТ';
  }
}

watch(id, load, { immediate: true });

const NOTICES: Partial<Record<TrajectoryDto['status'], string>> = {
  ACTIVE: 'ИОТ утверждена и назначена: маршрут активен, студент получил уведомление.',
  COMPLETED: 'Маршрут завершён: студент видит итоговую оценку.',
};

function onUpdated(next: TrajectoryDto): void {
  const corrected = correcting.value;
  trajectory.value = next;
  correcting.value = false;
  if (route.query.correct) void router.replace({ query: {} });
  notice.value = corrected
    ? `Утверждена версия ${next.version}: прежняя версия сохранена, студент получил уведомление.`
    : (NOTICES[next.status] ?? `Статус ИОТ: «${TRAJECTORY_STATUS_LABELS[next.status]}».`);
}

function cancelCorrection(): void {
  correcting.value = false;
  if (route.query.correct) void router.replace({ query: {} });
}

const busy = ref(false);
const actionError = ref<string | null>(null);
const confirmApprove = ref(false);
const confirmReturn = ref(false);
const confirmNeedsCorrection = ref(false);
const confirmArchive = ref(false);
const completeOpen = ref(false);
const finalAssessment = ref('');
const finalError = ref<string | null>(null);

type Action = 'approve' | 'return' | 'needs-correction' | 'complete' | 'archive';

async function act(path: Action, body: Record<string, unknown> = {}): Promise<void> {
  if (!trajectory.value) return;
  busy.value = true;
  actionError.value = null;
  try {
    const next = await api<TrajectoryDto>(`/trajectories/${trajectory.value.id}/${path}`, {
      method: 'POST',
      body: { updatedAt: trajectory.value.updatedAt, ...body },
    });
    confirmApprove.value = false;
    confirmReturn.value = false;
    confirmNeedsCorrection.value = false;
    confirmArchive.value = false;
    completeOpen.value = false;
    onUpdated(next);
  } catch (caught) {
    actionError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось выполнить действие';
  } finally {
    busy.value = false;
  }
}

function openComplete(): void {
  finalAssessment.value = '';
  finalError.value = null;
  actionError.value = null;
  completeOpen.value = true;
}

function complete(): void {
  const text = finalAssessment.value.trim();
  if (!text) {
    finalError.value = 'Опишите, насколько достигнуты цели маршрута';
    return;
  }
  void act('complete', { finalAssessment: text });
}

const versionOpen = ref(false);
const versionNumber = ref<number | null>(null);
function openVersion(number: number): void {
  versionNumber.value = number;
  versionOpen.value = true;
}
</script>

<template>
  <div class="iot-page trajectory">
    <RouterLink
      :to="trajectory ? `/students/${trajectory.student.id}?tab=trajectory` : '/trajectories'"
      class="trajectory__back"
    >
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ trajectory ? 'Профиль студента' : 'Индивидуальные траектории' }}
    </RouterLink>
    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="!trajectory" role="status">Загрузка…</p>
    <template v-else>
      <div class="trajectory__heading">
        <h1>ИОТ · {{ trajectory.student.fullName }} · {{ trajectory.discipline.name }}</h1>
        <StatusBadge v-bind="trajectoryBadge(trajectory.status)" />
      </div>
      <Message v-if="notice" severity="success" role="status" @close="notice = null">
        {{ notice }}
      </Message>

      <TrajectoryEditor
        v-if="trajectory.status === 'DRAFT'"
        :trajectory="trajectory"
        @updated="onUpdated"
      />
      <template v-else-if="correcting">
        <Message severity="info" :closable="false">
          Корректировка версии {{ trajectory.version }}: измените сроки, задания, этапы и их порядок
          или способы сопровождения. На шаге «Предпросмотр» укажите причину и подтвердите новую
          версию — прежняя сохранится в истории.
        </Message>
        <TrajectoryEditor
          :trajectory="trajectory"
          mode="correction"
          @updated="onUpdated"
          @cancel="cancelCorrection"
        />
      </template>
      <template v-else>
        <section
          v-if="correctable || trajectory.status === 'COMPLETED'"
          class="iot-card trajectory__toolbar"
          aria-label="Действия с маршрутом"
        >
          <Button
            v-if="correctable && canApprove"
            label="Корректировать"
            icon="pi pi-pencil"
            @click="correcting = true"
          />
          <Button
            v-if="trajectory.status === 'ACTIVE'"
            label="Требует корректировки"
            icon="pi pi-exclamation-triangle"
            severity="secondary"
            outlined
            @click="confirmNeedsCorrection = true"
          />
          <Button
            v-if="trajectory.status === 'ACTIVE'"
            label="Завершить маршрут"
            icon="pi pi-flag-fill"
            severity="secondary"
            outlined
            @click="openComplete"
          />
          <Button
            v-if="trajectory.status === 'COMPLETED'"
            label="В архив"
            icon="pi pi-box"
            severity="secondary"
            outlined
            @click="confirmArchive = true"
          />
          <RouterLink
            v-if="canMonitor && trajectory.status !== 'ARCHIVED'"
            :to="`/monitoring/${trajectory.id}`"
            class="p-button p-button-text"
          >
            <i class="pi pi-chart-line" aria-hidden="true" />&nbsp;Мониторинг
          </RouterLink>
          <p v-if="correctable && !canApprove" class="trajectory__muted">
            Корректировку утверждает преподаватель с правом «Утверждение ИОТ».
          </p>
          <p v-if="trajectory.status === 'NEEDS_CORRECTION'" class="trajectory__muted">
            Маршрут отмечен как требующий корректировки: подтвердите новую версию.
          </p>
          <Message v-if="actionError" severity="error" role="alert" class="trajectory__wide">
            {{ actionError }}
          </Message>
        </section>

        <section
          v-if="trajectory.status === 'COMPLETED' || trajectory.finalAssessment"
          class="iot-card"
          aria-labelledby="final-title"
        >
          <h2 id="final-title" class="trajectory__title">Итоговая оценка достижения целей</h2>
          <p class="trajectory__muted">
            Маршрут завершён {{ formatDate(trajectory.completedAt) }}. Оценка видна студенту.
          </p>
          <p class="trajectory__text">{{ trajectory.finalAssessment ?? 'Нет данных' }}</p>
        </section>

        <TrajectoryPassport :trajectory="trajectory" />
        <section aria-labelledby="map-title">
          <h2 id="map-title" class="trajectory__title">Карта маршрута</h2>
          <StageMap
            :stages="trajectory.stages"
            :current-stage-id="trajectory.currentStageId"
            :support-methods="trajectory.supportMethods"
          />
        </section>

        <section
          v-if="trajectory.status === 'PENDING_APPROVAL'"
          class="iot-card trajectory__pending"
        >
          <p>Маршрут отправлен на согласование и ждёт утверждения.</p>
          <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>
          <div v-if="canApprove" class="trajectory__actions">
            <Button
              label="Утвердить и назначить"
              icon="pi pi-check"
              :loading="busy"
              @click="confirmApprove = true"
            />
            <Button
              label="Вернуть на доработку"
              icon="pi pi-undo"
              severity="secondary"
              outlined
              @click="confirmReturn = true"
            />
          </div>
          <p v-else class="trajectory__muted">
            Утверждает преподаватель с правом «Утверждение ИОТ».
          </p>
        </section>

        <section
          v-if="trajectory.proposals.length"
          class="iot-card"
          aria-labelledby="proposals-title"
        >
          <h2 id="proposals-title" class="trajectory__title">Предложения студента</h2>
          <p class="trajectory__muted">
            Маршрут не меняется автоматически: решение о корректировке принимает преподаватель.
          </p>
          <ul class="trajectory__versions">
            <li v-for="proposal in trajectory.proposals" :key="proposal.id">
              {{ formatDateTime(proposal.createdAt) }} ·
              {{ proposal.stage ? `этап «${proposal.stage.title}»` : 'маршрут в целом' }}:
              <span class="trajectory__text">{{ proposal.body }}</span>
            </li>
          </ul>
        </section>

        <section
          v-if="trajectory.versions.length"
          class="iot-card"
          aria-labelledby="versions-title"
        >
          <h2 id="versions-title" class="trajectory__title">История версий</h2>
          <ul class="trajectory__history">
            <li v-for="version in trajectory.versions" :key="version.versionNumber">
              <span>
                <strong>Версия {{ version.versionNumber }}</strong> ·
                {{ formatDateTime(version.createdAt) }} ·
                {{ version.createdBy?.fullName ?? 'Нет данных' }}
                <template v-if="version.reason"> · причина: {{ version.reason }}</template>
              </span>
              <Button
                :label="version.versionNumber > 1 ? 'Изменения и маршрут' : 'Маршрут'"
                icon="pi pi-eye"
                size="small"
                text
                :aria-label="`Открыть версию ${version.versionNumber}`"
                @click="openVersion(version.versionNumber)"
              />
            </li>
          </ul>
        </section>
      </template>

      <TrajectoryVersionDialog
        v-model:visible="versionOpen"
        :trajectory-id="trajectory.id"
        :version-number="versionNumber"
      />
      <ActionDialog
        v-model:visible="confirmApprove"
        title="Утвердить и назначить ИОТ"
        message="Маршрут станет активным, задания этапов будут назначены, студент получит уведомление."
        confirm-label="Утвердить и назначить"
        :busy="busy"
        :error="actionError"
        @confirm="act('approve')"
      />
      <ActionDialog
        v-model:visible="confirmReturn"
        title="Вернуть на доработку"
        message="Маршрут вернётся в черновик. Укажите, что нужно доработать."
        confirm-label="Вернуть"
        require-reason
        :busy="busy"
        :error="actionError"
        @confirm="(reason) => act('return', { reason })"
      />
      <ActionDialog
        v-model:visible="confirmNeedsCorrection"
        title="Требует корректировки"
        message="Маршрут будет отмечен как требующий корректировки по итогам мониторинга. Затем подтвердите новую версию."
        confirm-label="Отметить"
        require-reason
        :busy="busy"
        :error="actionError"
        @confirm="(reason) => act('needs-correction', { reason })"
      />
      <ActionDialog
        v-model:visible="confirmArchive"
        title="Перенести ИОТ в архив"
        message="Завершённый маршрут перейдёт в архив. Его версии и результаты сохранятся."
        confirm-label="В архив"
        require-reason
        :busy="busy"
        :error="actionError"
        @confirm="(reason) => act('archive', { reason })"
      />
      <Dialog
        v-model:visible="completeOpen"
        modal
        header="Завершить маршрут"
        :style="{ width: '32rem' }"
        :breakpoints="{ '575px': '95vw' }"
      >
        <form class="iot-form" novalidate @submit.prevent="complete">
          <p>
            Незавершённые задания маршрута будут отменены, выполненные останутся в истории. Ответы
            на проверке нужно проверить заранее.
          </p>
          <div class="iot-field">
            <label for="final-assessment">Итоговая оценка достижения целей</label>
            <Textarea
              id="final-assessment"
              v-model="finalAssessment"
              rows="5"
              :maxlength="TRAJECTORY_FINAL_ASSESSMENT_MAX"
              :invalid="!!finalError"
              fluid
            />
            <small v-if="finalError" class="iot-field-error">{{ finalError }}</small>
            <small v-else class="trajectory__muted">Оценку увидит студент.</small>
          </div>
          <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>
          <div class="trajectory__actions trajectory__end">
            <Button
              label="Отмена"
              type="button"
              severity="secondary"
              text
              @click="completeOpen = false"
            />
            <Button label="Завершить" icon="pi pi-flag-fill" type="submit" :loading="busy" />
          </div>
        </form>
      </Dialog>
    </template>
  </div>
</template>

<style scoped>
.trajectory {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.trajectory__back {
  align-self: flex-start;
}

.trajectory__heading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.trajectory__heading h1 {
  margin: 0;
  font-size: 1.375rem;
}

.trajectory__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.0625rem;
}

.trajectory__pending p {
  margin: 0 0 var(--iot-space-2);
}

.trajectory__toolbar,
.trajectory__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.trajectory__end {
  justify-content: flex-end;
}

.trajectory__wide {
  flex-basis: 100%;
}

.trajectory__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.trajectory__versions {
  margin: 0;
  padding-left: var(--iot-space-4);
}

.trajectory__history {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.trajectory__history li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  justify-content: space-between;
}

.trajectory__text {
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
