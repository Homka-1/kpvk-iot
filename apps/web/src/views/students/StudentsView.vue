<script setup lang="ts">
import {
  Permission,
  PROFILE_FILTER_VALUES,
  type ProfileFilterValue,
  type StudentPageDto,
  TRAJECTORY_STATUS_LABELS,
  TrajectoryStatus,
} from '@iot/shared';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Paginator, { type PageState } from 'primevue/paginator';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import CreateStudentDialog from './CreateStudentDialog.vue';
import ImportStudentsDialog from './ImportStudentsDialog.vue';
import { PROFILE_FILTER_LABELS } from './labels';
import StudentCard from './StudentCard.vue';

/**
 * Раздел «Студенты» (п. 4.2 ТЗ): карточки студентов доступных групп (FR-002), поиск (FR-007),
 * фильтры (FR-008), добавление и импорт (FR-006). Группа и дисциплина берутся из шапки.
 */
const PAGE_SIZE = 20;
const route = useRoute();
const auth = useAuthStore();
const context = useContextStore();
const canManage = computed(() => auth.hasPermission(Permission.STUDENTS_MANAGE));

const filters = reactive<{
  search: string;
  profile: ProfileFilterValue | null;
  trajectoryStatus: TrajectoryStatus | null;
  difficulties: 'yes' | 'no' | null;
  archived: boolean;
}>({ search: '', profile: null, trajectoryStatus: null, difficulties: null, archived: false });
const page = ref<StudentPageDto | null>(null);
const current = ref(1);
const loading = ref(false);
const loadError = ref<string | null>(null);
const createOpen = ref(false);
const importOpen = ref(false);

const profileOptions = PROFILE_FILTER_VALUES.map((value) => ({
  value,
  label: PROFILE_FILTER_LABELS[value],
}));
// Переход из раздела «Мотивационные профили»: список уже отфильтрован по профилю (FR-003).
const queryProfile = route.query.profile;
if (PROFILE_FILTER_VALUES.includes(queryProfile as ProfileFilterValue)) {
  filters.profile = queryProfile as ProfileFilterValue;
}
const trajectoryOptions = Object.values(TrajectoryStatus).map((value) => ({
  value,
  label: TRAJECTORY_STATUS_LABELS[value],
}));
const difficultyOptions = [
  { value: 'yes', label: 'Есть затруднения' },
  { value: 'no', label: 'Нет затруднений' },
];
const archiveOptions = [
  { value: false, label: 'Действующие' },
  { value: true, label: 'Архив' },
];

const hasFilters = computed(
  () =>
    !!filters.search.trim() ||
    !!filters.profile ||
    !!filters.trajectoryStatus ||
    !!filters.difficulties ||
    !!context.groupId ||
    !!context.disciplineId,
);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    page.value = await api<StudentPageDto>('/students', {
      query: {
        search: filters.search.trim(),
        groupId: context.groupId,
        disciplineId: context.disciplineId,
        profile: filters.profile,
        trajectoryStatus: filters.trajectoryStatus,
        hasDifficulties: filters.difficulties ? String(filters.difficulties === 'yes') : null,
        archived: filters.archived ? 'true' : null,
        page: current.value,
        pageSize: PAGE_SIZE,
      },
    });
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить список';
  } finally {
    loading.value = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [{ ...filters }, context.groupId, context.disciplineId],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      current.value = 1;
      void load();
    }, 300);
  },
);

function onPage(event: PageState): void {
  current.value = event.page + 1;
  void load();
}

function resetFilters(): void {
  Object.assign(filters, { search: '', profile: null, trajectoryStatus: null, difficulties: null });
  context.groupId = null;
  context.disciplineId = null;
}

function onChanged(): void {
  void load();
  void context.load().catch(() => undefined);
}

onMounted(load);
</script>

<template>
  <div class="iot-page students">
    <div class="students__title">
      <h1>{{ route.meta.title }}</h1>
      <div v-if="canManage" class="students__actions">
        <Button
          label="Импорт"
          icon="pi pi-upload"
          severity="secondary"
          outlined
          @click="importOpen = true"
        />
        <Button label="Добавить студента" icon="pi pi-user-plus" @click="createOpen = true" />
      </div>
    </div>

    <div class="students__toolbar">
      <IconField class="students__search">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filters.search"
          placeholder="Фамилия, код участника или группа"
          aria-label="Поиск студентов"
          fluid
        />
      </IconField>
      <Select
        v-model="filters.profile"
        :options="profileOptions"
        option-label="label"
        option-value="value"
        placeholder="Любой профиль"
        show-clear
        aria-label="Фильтр по мотивационному профилю"
        class="students__filter"
      />
      <Select
        v-model="filters.trajectoryStatus"
        :options="trajectoryOptions"
        option-label="label"
        option-value="value"
        placeholder="Любой статус ИОТ"
        show-clear
        aria-label="Фильтр по статусу ИОТ"
        class="students__filter"
      />
      <Select
        v-model="filters.difficulties"
        :options="difficultyOptions"
        option-label="label"
        option-value="value"
        placeholder="Затруднения: все"
        show-clear
        aria-label="Фильтр по наличию затруднений"
        class="students__filter"
      />
      <SelectButton
        v-model="filters.archived"
        :options="archiveOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-label="Действующие студенты или архив"
      />
    </div>

    <p v-if="context.group || context.discipline" class="students__context" role="status">
      <i class="pi pi-filter" aria-hidden="true" />
      Выбрано в шапке:
      <template v-if="context.group">группа {{ context.group.name }}</template>
      <template v-if="context.group && context.discipline">, </template>
      <template v-if="context.discipline">дисциплина {{ context.discipline.name }}</template>
    </p>

    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <template v-else-if="page">
      <p class="students__count" role="status">
        {{ loading ? 'Обновление…' : `Найдено студентов: ${page.total}` }}
      </p>
      <EmptyState
        v-if="page.total === 0 && context.groups.length === 0 && !filters.archived"
        icon="pi pi-users"
        title="Нет доступных групп"
        description="Вы пока не закреплены ни за одной группой. Закрепление за группами и дисциплинами выполняет администратор в разделе «Дисциплины»."
      />
      <EmptyState
        v-else-if="page.total === 0 && hasFilters"
        title="Студенты не найдены"
        description="По выбранным условиям никого нет. Измените поиск или сбросьте фильтры."
      >
        <Button label="Сбросить фильтры" severity="secondary" outlined @click="resetFilters" />
      </EmptyState>
      <EmptyState
        v-else-if="page.total === 0"
        icon="pi pi-users"
        :title="filters.archived ? 'Архив пуст' : 'Студентов пока нет'"
        :description="
          filters.archived
            ? 'Архивированные студенты появятся здесь.'
            : 'Добавьте студентов вручную или загрузите список из файла CSV или XLSX.'
        "
      >
        <template v-if="canManage && !filters.archived">
          <Button label="Импорт из файла" icon="pi pi-upload" outlined @click="importOpen = true" />
          <Button label="Добавить студента" icon="pi pi-user-plus" @click="createOpen = true" />
        </template>
      </EmptyState>
      <template v-else>
        <div class="students__grid">
          <StudentCard
            v-for="student in page.items"
            :key="student.id"
            :student="student"
            :to="`/students/${student.id}`"
          />
        </div>
        <Paginator
          v-if="page.total > PAGE_SIZE"
          :rows="PAGE_SIZE"
          :total-records="page.total"
          :first="(current - 1) * PAGE_SIZE"
          template="PrevPageLink PageLinks NextPageLink"
          @page="onPage"
        />
      </template>
    </template>
    <p v-else role="status">Загрузка…</p>

    <CreateStudentDialog
      v-model:visible="createOpen"
      :groups="context.groups"
      :default-group-id="context.groupId"
      @created="onChanged"
    />
    <ImportStudentsDialog v-model:visible="importOpen" @imported="onChanged" />
  </div>
</template>

<style scoped>
.students {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.students__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-3);
}

.students__title h1 {
  margin: 0;
}

.students__actions,
.students__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.students__search {
  flex: 1 1 260px;
}

.students__filter {
  flex: 0 1 220px;
  min-width: 0;
}

.students__context,
.students__count {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.students__context {
  padding: var(--iot-space-2) var(--iot-space-3);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-info-text);
}

.students__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
  gap: var(--iot-space-3);
}

@media (max-width: 575px) {
  .students__filter {
    flex: 1 1 100%;
  }
}
</style>
