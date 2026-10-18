<script setup lang="ts">
import { Permission, TRAJECTORY_STATUS_LABELS, type TrajectoryDto } from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';
import { trajectoryBadge } from '@/views/students/labels';
import StageMap from './StageMap.vue';
import TrajectoryEditor from './TrajectoryEditor.vue';
import TrajectoryPassport from './TrajectoryPassport.vue';

/**
 * Страница ИОТ (п. 6.4): черновик открывается в конструкторе (UC-03), остальные статусы —
 * паспорт и карта этапов. Маршрут «На утверждении» утверждает или возвращает на доработку
 * преподаватель с правом утверждения (FR-039).
 */
const route = useRoute();
const auth = useAuthStore();
const canApprove = computed(() => auth.hasPermission(Permission.TRAJECTORIES_APPROVE));
const id = computed(() => String(route.params.id));
const trajectory = ref<TrajectoryDto | null>(null);
const loadError = ref<string | null>(null);
const notice = ref<string | null>(null);

async function load(): Promise<void> {
  trajectory.value = null;
  loadError.value = null;
  try {
    trajectory.value = await api<TrajectoryDto>(`/trajectories/${id.value}`);
  } catch (caught) {
    loadError.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить ИОТ';
  }
}

watch(id, load, { immediate: true });

function onUpdated(next: TrajectoryDto): void {
  trajectory.value = next;
  notice.value =
    next.status === 'ACTIVE'
      ? 'ИОТ утверждена и назначена: маршрут активен, студент получил уведомление.'
      : `Статус ИОТ: «${TRAJECTORY_STATUS_LABELS[next.status]}».`;
}

const busy = ref(false);
const actionError = ref<string | null>(null);
const confirmApprove = ref(false);
const confirmReturn = ref(false);

async function act(path: 'approve' | 'return', reason?: string): Promise<void> {
  if (!trajectory.value) return;
  busy.value = true;
  actionError.value = null;
  try {
    const next = await api<TrajectoryDto>(`/trajectories/${trajectory.value.id}/${path}`, {
      method: 'POST',
      body: { updatedAt: trajectory.value.updatedAt, ...(reason ? { reason } : {}) },
    });
    confirmApprove.value = false;
    confirmReturn.value = false;
    onUpdated(next);
  } catch (caught) {
    actionError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось выполнить действие';
  } finally {
    busy.value = false;
  }
}

function returnToDraft(reason: string): Promise<void> {
  return act('return', reason);
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
      <template v-else>
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
          v-if="trajectory.versions.length"
          class="iot-card"
          aria-labelledby="versions-title"
        >
          <h2 id="versions-title" class="trajectory__title">Версии маршрута</h2>
          <ul class="trajectory__versions">
            <li v-for="version in trajectory.versions" :key="version.versionNumber">
              Версия {{ version.versionNumber }} · {{ formatDateTime(version.createdAt) }} ·
              {{ version.createdBy?.fullName ?? 'Нет данных' }}
              <template v-if="version.reason"> · причина: {{ version.reason }}</template>
            </li>
          </ul>
        </section>
      </template>

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
        @confirm="returnToDraft"
      />
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

.trajectory__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.trajectory__muted {
  color: var(--iot-color-muted);
}

.trajectory__versions {
  margin: 0;
  padding-left: var(--iot-space-4);
}
</style>
