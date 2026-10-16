<script setup lang="ts">
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent } from 'primevue/datatable';
import Select from 'primevue/select';
import { onMounted, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { formatDateTime } from '@/utils/format';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, type AuditLogItem, type Page } from './types';

/** Журнал аудита (п. 8.3 ТЗ): кто, когда и что изменил. Записи не редактируются. */
const PAGE_SIZE = 50;
const action = ref<string | null>(null);
const page = ref<Page<AuditLogItem> | null>(null);
const current = ref(1);
const loading = ref(false);
const loadError = ref<string | null>(null);
const expanded = ref<Record<string, boolean>>({});

const actionOptions = Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    page.value = await api<Page<AuditLogItem>>('/audit-logs', {
      query: { action: action.value, page: current.value, pageSize: PAGE_SIZE },
    });
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить журнал';
  } finally {
    loading.value = false;
  }
}

watch(action, () => {
  current.value = 1;
  void load();
});

function onPage(event: DataTablePageEvent): void {
  current.value = event.page + 1;
  void load();
}

function details(item: AuditLogItem): string {
  return JSON.stringify({ до: item.before, после: item.after }, null, 2);
}

onMounted(load);
</script>

<template>
  <div class="audit-panel">
    <div class="audit-panel__toolbar">
      <Select
        v-model="action"
        :options="actionOptions"
        option-label="label"
        option-value="value"
        placeholder="Все действия"
        show-clear
        aria-label="Фильтр по действию"
        class="audit-panel__filter"
      />
    </div>
    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <DataTable
      v-else
      v-model:expanded-rows="expanded"
      :value="page?.items ?? []"
      :loading="loading"
      lazy
      paginator
      :rows="PAGE_SIZE"
      :total-records="page?.total ?? 0"
      :first="(current - 1) * PAGE_SIZE"
      data-key="id"
      striped-rows
      @page="onPage"
    >
      <template #empty>
        <EmptyState
          title="Записей нет"
          description="Действия появятся здесь после их выполнения."
        />
      </template>
      <Column expander header="Подробности" class="audit-panel__expander" />
      <Column header="Дата и время">
        <template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template>
      </Column>
      <Column header="Действие">
        <template #body="{ data }">{{ AUDIT_ACTION_LABELS[data.action] ?? data.action }}</template>
      </Column>
      <Column header="Объект">
        <template #body="{ data }">
          {{ AUDIT_ENTITY_LABELS[data.entityType] ?? data.entityType }}
        </template>
      </Column>
      <Column header="Автор">
        <template #body="{ data }">{{ data.actorName ?? 'Система' }}</template>
      </Column>
      <Column header="Причина">
        <template #body="{ data }">{{ data.reason ?? '—' }}</template>
      </Column>
      <template #expansion="{ data }">
        <dl class="audit-panel__details">
          <dt>Идентификатор объекта</dt>
          <dd>{{ data.entityId ?? '—' }}</dd>
          <dt>IP-адрес</dt>
          <dd>{{ data.ipAddress ?? '—' }}</dd>
          <dt>Изменения</dt>
          <dd>
            <pre>{{ details(data) }}</pre>
          </dd>
        </dl>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.audit-panel {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.audit-panel__filter {
  width: 280px;
  max-width: 100%;
}

.audit-panel__details {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--iot-space-1) var(--iot-space-3);
  margin: 0;
}

.audit-panel__details dt {
  color: var(--iot-color-muted);
}

.audit-panel__details dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.audit-panel__details pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.8125rem;
}
</style>
