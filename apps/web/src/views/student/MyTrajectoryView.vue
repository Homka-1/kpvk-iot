<script setup lang="ts">
import type { CabinetTrajectoryDto, RouteProposalDto } from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate, formatDateTime } from '@/utils/format';
import { dueText } from '@/views/assignments/status';
import { trajectoryBadge } from '@/views/students/labels';
import StageMap from '@/views/trajectories/StageMap.vue';
import RouteProposalDialog from './RouteProposalDialog.vue';
import StageMaterialLink from './StageMaterialLink.vue';

/**
 * «Моя траектория» (п. 3.2, п. 6.4; FR-040, FR-041, AT-06): утверждённая ИОТ — цель, сроки
 * и карта пяти этапов; у этапа — материалы, задания и контрольные точки. Несколько ИОТ —
 * по разным дисциплинам (FR-045). Студент может предложить изменение маршрута (п. 2.3).
 */
const route = useRoute();
const items = ref<CabinetTrajectoryDto[] | null>(null);
const error = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const proposalOpen = ref(false);
const notice = ref<string | null>(null);

const trajectory = computed(
  () => items.value?.find((item) => item.id === selectedId.value) ?? items.value?.[0] ?? null,
);
const disciplineOptions = computed(
  () => items.value?.map((item) => ({ value: item.id, label: item.discipline.name })) ?? [],
);
const currentStage = computed(() =>
  trajectory.value?.stages.find((stage) => stage.id === trajectory.value?.currentStageId),
);
const canPropose = computed(
  () => trajectory.value?.status === 'ACTIVE' || trajectory.value?.status === 'NEEDS_CORRECTION',
);

async function load(): Promise<void> {
  error.value = null;
  try {
    items.value = await api<CabinetTrajectoryDto[]>('/cabinet/trajectories');
    selectedId.value ??= items.value[0]?.id ?? null;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить траекторию';
  }
}

function onProposed(proposal: RouteProposalDto): void {
  trajectory.value?.proposals.unshift(proposal);
  notice.value = 'Предложение отправлено преподавателю.';
}

onMounted(load);
</script>

<template>
  <div class="iot-page my-trajectory">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!items" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="!trajectory"
      icon="pi pi-directions"
      title="Траектория пока не назначена"
      description="Когда преподаватель утвердит вашу индивидуальную траекторию, здесь появятся цели, этапы и задания."
    />
    <template v-else>
      <div v-if="items.length > 1" class="my-trajectory__switch">
        <label id="my-trajectory-discipline-label" for="my-trajectory-discipline">Дисциплина</label>
        <Select
          v-model="selectedId"
          input-id="my-trajectory-discipline"
          aria-labelledby="my-trajectory-discipline-label"
          :options="disciplineOptions"
          option-label="label"
          option-value="value"
        />
      </div>

      <section class="iot-card my-trajectory__goal" aria-labelledby="my-trajectory-goal">
        <div class="my-trajectory__heading">
          <h2 id="my-trajectory-goal">{{ trajectory.discipline.name }}</h2>
          <StatusBadge v-bind="trajectoryBadge(trajectory.status)" />
        </div>
        <dl class="my-trajectory__facts">
          <div class="my-trajectory__wide">
            <dt>Моя цель</dt>
            <dd class="my-trajectory__text">{{ trajectory.goals || 'Нет данных' }}</dd>
          </div>
          <div>
            <dt>Сейчас</dt>
            <dd>
              {{
                currentStage
                  ? `Этап ${currentStage.sortOrder + 1}. ${currentStage.title}`
                  : 'Нет данных'
              }}
            </dd>
          </div>
          <div>
            <dt>Сроки</dt>
            <dd>
              {{ formatDate(trajectory.startDate) }} – {{ formatDate(trajectory.plannedEndDate) }}
            </dd>
          </div>
          <div>
            <dt>Преподаватель</dt>
            <dd>{{ trajectory.teacher?.fullName ?? 'Нет данных' }}</dd>
          </div>
          <div v-if="trajectory.plannedResults" class="my-trajectory__wide">
            <dt>Планируемые результаты</dt>
            <dd class="my-trajectory__text">{{ trajectory.plannedResults }}</dd>
          </div>
          <div v-if="trajectory.finalAssessment" class="my-trajectory__wide">
            <dt>Итог маршрута ({{ formatDate(trajectory.completedAt) }})</dt>
            <dd class="my-trajectory__text">{{ trajectory.finalAssessment }}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="my-trajectory-map">
        <h2 id="my-trajectory-map" class="my-trajectory__title">Карта маршрута</h2>
        <StageMap
          :stages="trajectory.stages"
          :current-stage-id="trajectory.currentStageId"
          :support-methods="trajectory.supportMethods"
        >
          <template #material="{ material }">
            <StageMaterialLink :material="material" />
          </template>
          <template #assignment="{ item }">
            <RouterLink :to="{ name: 'student-assignment-details', params: { id: item.id } }">
              {{ item.assignment.title }}
            </RouterLink>
            <span class="my-trajectory__muted">· {{ dueText(item.dueAt) }}</span>
          </template>
        </StageMap>
      </section>

      <section class="iot-card" aria-labelledby="my-trajectory-proposals">
        <div class="my-trajectory__heading">
          <h2 id="my-trajectory-proposals" class="my-trajectory__title">Мои предложения</h2>
          <Button
            v-if="canPropose"
            label="Предложить изменение"
            icon="pi pi-pencil"
            size="small"
            outlined
            aria-haspopup="dialog"
            @click="proposalOpen = true"
          />
        </div>
        <Message v-if="notice" severity="success" role="status" @close="notice = null">
          {{ notice }}
        </Message>
        <p class="my-trajectory__muted">
          Свои интересы укажите в разделе
          <RouterLink :to="{ name: 'student-profile' }">«Мой профиль»</RouterLink> — преподаватель
          учтёт их при планировании маршрута.
        </p>
        <ul v-if="trajectory.proposals.length" class="my-trajectory__proposals">
          <li v-for="proposal in trajectory.proposals" :key="proposal.id">
            <span class="my-trajectory__muted">
              {{ formatDateTime(proposal.createdAt) }} ·
              {{ proposal.stage ? `этап «${proposal.stage.title}»` : 'маршрут в целом' }}
            </span>
            <span class="my-trajectory__text">{{ proposal.body }}</span>
          </li>
        </ul>
        <p v-else class="my-trajectory__muted">Вы ещё не предлагали изменений.</p>
      </section>

      <RouteProposalDialog
        v-model:visible="proposalOpen"
        :trajectory-id="trajectory.id"
        :stages="trajectory.stages"
        @created="onProposed"
      />
    </template>
  </div>
</template>

<style scoped>
.my-trajectory {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.my-trajectory h1,
.my-trajectory h2 {
  margin: 0;
}

.my-trajectory__switch {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  max-width: 24rem;
}

.my-trajectory__heading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--iot-space-2);
}

.my-trajectory__title {
  font-size: 1.0625rem;
}

.my-trajectory__goal h2 {
  font-size: 1.125rem;
}

.my-trajectory__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
}

.my-trajectory__wide {
  grid-column: 1 / -1;
}

.my-trajectory__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.my-trajectory__facts dd {
  margin: 0;
}

.my-trajectory__text {
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.my-trajectory__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.my-trajectory__proposals {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: var(--iot-space-2) 0 0;
  padding: 0;
  list-style: none;
}

.my-trajectory__proposals li {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}
</style>
