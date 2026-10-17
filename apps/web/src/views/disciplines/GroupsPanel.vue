<script setup lang="ts">
import type { GroupDto } from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import { onMounted, ref, watch } from 'vue';
import { api } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import GroupDialog from './GroupDialog.vue';
import { useAction, useList } from './useList';

/** Учебные группы (п. 2.1 ТЗ): курс, специальность, число студентов, архив. */
const emit = defineEmits<{ changed: [] }>();
const includeArchived = ref(false);
const list = useList<GroupDto>(
  () => '/groups',
  () => ({ includeArchived: includeArchived.value ? 'true' : null }),
);
const action = useAction();
const editorOpen = ref(false);
const archiveOpen = ref(false);
const selected = ref<GroupDto | null>(null);

watch(includeArchived, list.load);
onMounted(list.load);

function edit(group: GroupDto | null): void {
  selected.value = group;
  editorOpen.value = true;
}

function onSaved(): void {
  void list.load();
  emit('changed');
}

async function archive(reason: string): Promise<void> {
  const target = selected.value;
  if (!target) return;
  if (
    await action.run(() =>
      api(`/groups/${target.id}/archive`, { method: 'POST', body: { reason } }),
    )
  ) {
    archiveOpen.value = false;
    onSaved();
  }
}

async function restore(group: GroupDto): Promise<void> {
  if (await action.run(() => api(`/groups/${group.id}/restore`, { method: 'POST' }))) onSaved();
}
</script>

<template>
  <div class="panel">
    <div class="panel__toolbar">
      <div class="panel__check">
        <Checkbox v-model="includeArchived" input-id="groups-archived" binary />
        <label for="groups-archived">Показать архивные</label>
      </div>
      <Button label="Добавить группу" icon="pi pi-plus" @click="edit(null)" />
    </div>
    <p v-if="action.error.value && !archiveOpen" class="iot-field-error" role="alert">
      {{ action.error.value }}
    </p>
    <ErrorState v-if="list.error.value" :message="list.error.value" retryable @retry="list.load" />
    <DataTable
      v-else
      :value="list.items.value"
      :loading="list.loading.value"
      data-key="id"
      striped-rows
      scrollable
    >
      <template #empty>
        <EmptyState
          icon="pi pi-sitemap"
          title="Групп нет"
          description="Добавьте учебные группы: название, курс и специальность."
        />
      </template>
      <Column field="name" header="Группа" />
      <Column field="course" header="Курс" />
      <Column field="specialty" header="Специальность" />
      <Column header="Студентов">
        <template #body="{ data }">{{ data.studentCount }}</template>
      </Column>
      <Column header="Состояние">
        <template #body="{ data }">
          <StatusBadge v-if="data.archivedAt" label="В архиве" tone="neutral" icon="pi pi-box" />
          <StatusBadge v-else label="Действует" tone="success" />
        </template>
      </Column>
      <Column header="Действия">
        <template #body="{ data }">
          <div class="panel__row-actions">
            <Button
              v-if="data.archivedAt"
              label="Вернуть"
              size="small"
              text
              @click="restore(data)"
            />
            <template v-else>
              <Button
                icon="pi pi-pencil"
                size="small"
                text
                :aria-label="`Изменить группу ${data.name}`"
                @click="edit(data)"
              />
              <Button
                icon="pi pi-box"
                size="small"
                text
                severity="danger"
                :aria-label="`Архивировать группу ${data.name}`"
                @click="
                  selected = data;
                  archiveOpen = true;
                "
              />
            </template>
          </div>
        </template>
      </Column>
    </DataTable>

    <GroupDialog v-model:visible="editorOpen" :group="selected" @saved="onSaved" />
    <ActionDialog
      v-model:visible="archiveOpen"
      title="Архивирование группы"
      :message="`Группа «${selected?.name}» скроется из списков. Архивировать можно только группу без действующих студентов.`"
      confirm-label="В архив"
      require-reason
      danger
      :busy="action.busy.value"
      :error="action.error.value"
      @confirm="archive"
    />
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.panel__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.panel__check,
.panel__row-actions {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}
</style>
