<script setup lang="ts">
import { TRAJECTORY_STATUS_LABELS, type TrajectoryPageDto, TrajectoryStatus } from '@iot/shared';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Paginator, { type PageState } from 'primevue/paginator';
import Select from 'primevue/select';
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useContextStore } from '@/stores/context';
import TrajectoryCards from './TrajectoryCards.vue';

/**
 * Раздел «Индивидуальные траектории»: ИОТ студентов доступных групп и дисциплин (FR-002,
 * FR-045) с поиском и фильтром по статусу. ИОТ создаётся из профиля студента (UC-03);
 * ссылка «Сформировать ИОТ» со студентом (FR-031) открывает конструктор.
 */
const PAGE_SIZE = 24;
const route = useRoute();
const router = useRouter();
const context = useContextStore();
const page = ref<TrajectoryPageDto | null>(null);
const error = ref<string | null>(null);
const search = ref('');
const status = ref<TrajectoryStatus | null>(null);
const current = ref(1);

const statusOptions = Object.values(TrajectoryStatus).map((value) => ({
  value,
  label: TRAJECTORY_STATUS_LABELS[value],
}));

// Старые ссылки «/trajectories?studentId=» ведут в конструктор.
if (typeof route.query.studentId === 'string') {
  void router.replace({ name: 'trajectory-new', query: { studentId: route.query.studentId } });
}

async function load(): Promise<void> {
  error.value = null;
  try {
    page.value = await api<TrajectoryPageDto>('/trajectories', {
      query: {
        groupId: context.groupId,
        disciplineId: context.disciplineId,
        status: status.value,
        q: search.value.trim(),
        page: current.value,
        pageSize: PAGE_SIZE,
      },
    });
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить ИОТ';
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [context.groupId, context.disciplineId, status.value, search.value],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      current.value = 1;
      void load();
    }, 300);
  },
);
void load();

function onPage(event: PageState): void {
  current.value = event.page + 1;
  void load();
}
</script>

<template>
  <div class="iot-page trajectories">
    <h1>{{ route.meta.title }}</h1>
    <p class="trajectories__muted">
      ИОТ создаётся из профиля студента: «Студенты» → студент → «Создать ИОТ». Черновик открывается
      в конструкторе, утверждённый маршрут — на карте этапов.
    </p>
    <div class="trajectories__filters">
      <IconField class="trajectories__search">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          placeholder="Ф. И. О. или код участника"
          aria-label="Поиск по студенту"
          fluid
        />
      </IconField>
      <Select
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="Все, кроме архивных"
        aria-label="Статус ИОТ"
        show-clear
      />
    </div>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!page" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="page.total === 0"
      icon="pi pi-directions"
      :title="search || status ? 'Ничего не найдено' : 'ИОТ пока нет'"
      :description="
        search || status
          ? 'Измените поиск или фильтр.'
          : 'Создайте ИОТ из профиля студента после утверждения мотивационного профиля.'
      "
    >
      <RouterLink to="/students" class="p-button p-button-outlined">Открыть «Студенты»</RouterLink>
    </EmptyState>
    <template v-else>
      <TrajectoryCards :items="page.items" />
      <Paginator
        v-if="page.total > PAGE_SIZE"
        :rows="PAGE_SIZE"
        :total-records="page.total"
        :first="(current - 1) * PAGE_SIZE"
        template="PrevPageLink PageLinks NextPageLink"
        @page="onPage"
      />
    </template>
  </div>
</template>

<style scoped>
.trajectories {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.trajectories h1 {
  margin: 0;
}

.trajectories__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.trajectories__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.trajectories__search {
  flex: 1 1 260px;
}
</style>
