<script setup lang="ts">
import { formatFullName, ROLE_LABELS, RoleCode, USER_STATUS_LABELS, UserStatus } from '@iot/shared';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent } from 'primevue/datatable';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { onMounted, reactive, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import CreateUserDialog from './CreateUserDialog.vue';
import { type Page, type PermissionInfo, type UserSummary, userState } from './types';
import UserEditor from './UserEditor.vue';

/** Список учётных записей с поиском и фильтрами; карточка открывается по строке. */
defineProps<{ permissions: PermissionInfo[] }>();

const PAGE_SIZE = 20;
const filters = reactive<{ search: string; role: RoleCode | null; status: UserStatus | null }>({
  search: '',
  role: null,
  status: null,
});
const page = ref<Page<UserSummary> | null>(null);
const current = ref(1);
const loading = ref(false);
const loadError = ref<string | null>(null);
const createOpen = ref(false);
const editorOpen = ref(false);
const selectedId = ref<string | null>(null);

const roleOptions = Object.values(RoleCode).map((value) => ({ value, label: ROLE_LABELS[value] }));
const statusOptions = Object.values(UserStatus).map((value) => ({
  value,
  label: USER_STATUS_LABELS[value],
}));

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    page.value = await api<Page<UserSummary>>('/admin/users', {
      query: {
        search: filters.search.trim(),
        role: filters.role,
        status: filters.status,
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

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => ({ ...filters }),
  () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      current.value = 1;
      void load();
    }, 300);
  },
);

function onPage(event: DataTablePageEvent): void {
  current.value = event.page + 1;
  void load();
}

function rolesText(roles: RoleCode[]): string {
  return roles.map((role) => ROLE_LABELS[role]).join(', ');
}

function open(user: UserSummary): void {
  selectedId.value = user.id;
  editorOpen.value = true;
}

onMounted(load);
</script>

<template>
  <div class="users-panel">
    <div class="users-panel__toolbar">
      <IconField class="users-panel__search">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filters.search"
          placeholder="ФИО, логин или e-mail"
          aria-label="Поиск пользователей"
          fluid
        />
      </IconField>
      <Select
        v-model="filters.role"
        :options="roleOptions"
        option-label="label"
        option-value="value"
        placeholder="Все роли"
        show-clear
        aria-label="Фильтр по роли"
        class="users-panel__filter"
      />
      <Select
        v-model="filters.status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="Все состояния"
        show-clear
        aria-label="Фильтр по состоянию"
        class="users-panel__filter"
      />
      <Button label="Добавить сотрудника" icon="pi pi-user-plus" @click="createOpen = true" />
    </div>

    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <DataTable
      v-else
      :value="page?.items ?? []"
      :loading="loading"
      lazy
      paginator
      :rows="PAGE_SIZE"
      :total-records="page?.total ?? 0"
      :first="(current - 1) * PAGE_SIZE"
      data-key="id"
      selection-mode="single"
      striped-rows
      class="users-panel__table"
      @page="onPage"
      @row-select="open($event.data)"
    >
      <template #empty>
        <EmptyState
          title="Пользователи не найдены"
          description="Измените условия поиска или добавьте сотрудника."
        />
      </template>
      <Column header="ФИО">
        <template #body="{ data }">
          <button type="button" class="users-panel__name" @click.stop="open(data)">
            {{ formatFullName(data) }}
          </button>
          <div class="users-panel__muted">{{ data.login }}</div>
        </template>
      </Column>
      <Column header="Роли">
        <template #body="{ data }">
          {{ rolesText(data.roles) }}
        </template>
      </Column>
      <Column header="Состояние">
        <template #body="{ data }">
          <StatusBadge v-bind="userState(data)" />
        </template>
      </Column>
      <Column header="Последний вход">
        <template #body="{ data }">{{ formatDateTime(data.lastLoginAt) }}</template>
      </Column>
    </DataTable>

    <CreateUserDialog v-model:visible="createOpen" @created="load" />
    <UserEditor
      v-model:visible="editorOpen"
      :user-id="selectedId"
      :permissions="permissions"
      @changed="load"
    />
  </div>
</template>

<style scoped>
.users-panel {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.users-panel__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.users-panel__search {
  flex: 1 1 240px;
}

.users-panel__filter {
  flex: 0 1 200px;
  min-width: 0;
}

.users-panel__name {
  padding: 0;
  border: 0;
  background: none;
  color: var(--iot-navy-700);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.users-panel__name:hover {
  text-decoration: underline;
}

.users-panel__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

@media (max-width: 575px) {
  .users-panel__filter {
    flex: 1 1 100%;
  }
}
</style>
