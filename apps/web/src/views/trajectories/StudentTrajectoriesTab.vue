<script setup lang="ts">
import {
  Permission,
  type TrajectoryDto,
  type TrajectoryPageDto,
  TrajectoryStatus,
} from '@iot/shared';
import Select from 'primevue/select';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDate } from '@/utils/format';
import { trajectoryBadge } from '@/views/students/labels';
import StageMap from './StageMap.vue';
import TrajectoryCards from './TrajectoryCards.vue';

/**
 * Вкладка «Моя ИОТ» профиля студента (п. 4.3, п. 6.3): центральная карта действующего маршрута
 * (FR-041) — цели, этапы, прогресс; ниже все маршруты по дисциплинам (FR-045) и переход
 * в конструктор (UC-03).
 */
const props = defineProps<{ studentId: string; archived: boolean }>();
const auth = useAuthStore();
const canManage = computed(() => auth.hasPermission(Permission.TRAJECTORIES_MANAGE));
const page = ref<TrajectoryPageDto | null>(null);
const error = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const current = ref<TrajectoryDto | null>(null);
const mapError = ref<string | null>(null);

/** Действующие маршруты, которые видит студент: их карта — в центре вкладки. */
const active = computed(
  () =>
    page.value?.items.filter(
      (item) =>
        item.status === TrajectoryStatus.ACTIVE ||
        item.status === TrajectoryStatus.NEEDS_CORRECTION,
    ) ?? [],
);
const options = computed(() =>
  active.value.map((item) => ({ value: item.id, label: item.discipline.name })),
);

async function load(): Promise<void> {
  if (!canManage.value) return;
  error.value = null;
  try {
    page.value = await api<TrajectoryPageDto>('/trajectories', {
      query: { studentId: props.studentId, pageSize: 100 },
    });
    selectedId.value = active.value[0]?.id ?? null;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить ИОТ';
  }
}

watch(selectedId, async (id) => {
  current.value = null;
  mapError.value = null;
  if (!id) return;
  try {
    const loaded = await api<TrajectoryDto>(`/trajectories/${id}`);
    if (selectedId.value === id) current.value = loaded;
  } catch (caught) {
    mapError.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить карту ИОТ';
  }
});

watch(() => props.studentId, load, { immediate: true });
</script>

<template>
  <EmptyState
    v-if="!canManage"
    icon="pi pi-lock"
    title="Нет доступа к ИОТ"
    description="Для просмотра нужно разрешение «Создание и корректировка ИОТ»."
  />
  <ErrorState v-else-if="error" :message="error" retryable @retry="load" />
  <p v-else-if="!page" role="status">Загрузка…</p>
  <div v-else class="student-trajectories">
    <section v-if="active.length" aria-labelledby="student-map-title">
      <div class="student-trajectories__head">
        <h2 id="student-map-title" class="student-trajectories__title">Карта действующей ИОТ</h2>
        <div v-if="active.length > 1" class="student-trajectories__switch">
          <label id="student-map-discipline-label" for="student-map-discipline">Дисциплина</label>
          <Select
            v-model="selectedId"
            input-id="student-map-discipline"
            aria-labelledby="student-map-discipline-label"
            :options="options"
            option-label="label"
            option-value="value"
          />
        </div>
      </div>
      <ErrorState v-if="mapError" :message="mapError" />
      <p v-else-if="!current" role="status">Загрузка…</p>
      <template v-else>
        <div class="iot-card student-trajectories__goal">
          <div class="student-trajectories__head">
            <RouterLink :to="`/trajectories/${current.id}`" class="student-trajectories__name">
              {{ current.discipline.name }}
            </RouterLink>
            <StatusBadge v-bind="trajectoryBadge(current.status)" />
          </div>
          <p class="student-trajectories__text">
            <strong>Цели:</strong> {{ current.goals || 'Нет данных' }}
          </p>
          <p class="student-trajectories__muted">
            {{ formatDate(current.startDate) }} – {{ formatDate(current.plannedEndDate) }} · версия
            {{ current.version }}
          </p>
        </div>
        <StageMap
          :stages="current.stages"
          :current-stage-id="current.currentStageId"
          :support-methods="current.supportMethods"
        />
      </template>
    </section>

    <section aria-labelledby="student-trajectories-all">
      <div class="student-trajectories__head">
        <h2 id="student-trajectories-all" class="student-trajectories__title">
          Все маршруты студента
        </h2>
        <RouterLink
          v-if="!archived"
          :to="{ name: 'trajectory-new', query: { studentId } }"
          class="p-button p-component"
        >
          <i class="pi pi-plus" aria-hidden="true" /> Создать ИОТ
        </RouterLink>
      </div>
      <EmptyState
        v-if="page.total === 0"
        icon="pi pi-directions"
        title="Индивидуальная траектория не создана"
        description="Создайте ИОТ: дисциплина, шаблон по мотивационному профилю, цели, этапы, задания и сроки."
      />
      <TrajectoryCards v-else :items="page.items" :show-student="false" />
    </section>
  </div>
</template>

<style scoped>
.student-trajectories {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.student-trajectories section {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.student-trajectories__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  justify-content: space-between;
}

.student-trajectories__title {
  margin: 0;
  font-size: 1.0625rem;
}

.student-trajectories__switch {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.student-trajectories__goal {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.student-trajectories__name {
  font-weight: 700;
}

.student-trajectories__text {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.student-trajectories__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
