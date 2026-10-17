<script setup lang="ts">
import type { DisciplineDto, GroupDto, PersonRef, TeacherAssignmentDto } from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { onMounted, reactive, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import { useAction, useList } from './useList';

/**
 * Закрепление преподавателей за группами и дисциплинами: открывает преподавателю доступ
 * к студентам группы (FR-002). Снятое закрепление остаётся в истории.
 */
const emit = defineEmits<{ changed: [] }>();
const includeEnded = ref(false);
const list = useList<TeacherAssignmentDto>(
  () => '/teacher-assignments',
  () => ({ includeEnded: includeEnded.value ? 'true' : null }),
);
const teachers = useList<PersonRef>(() => '/teacher-assignments/teachers');
const groups = useList<GroupDto>(() => '/groups');
const disciplines = useList<DisciplineDto>(() => '/disciplines');
const action = useAction();
const form = reactive<{
  teacherId: string | null;
  groupId: string | null;
  disciplineId: string | null;
}>({
  teacherId: null,
  groupId: null,
  disciplineId: null,
});
const formError = ref<string | null>(null);
const saving = ref(false);
const endOpen = ref(false);
const selected = ref<TeacherAssignmentDto | null>(null);

watch(includeEnded, list.load);
onMounted(() => Promise.all([list.load(), teachers.load(), groups.load(), disciplines.load()]));

async function create(): Promise<void> {
  if (!form.teacherId || !form.groupId || !form.disciplineId) {
    formError.value = 'Выберите преподавателя, группу и дисциплину';
    return;
  }
  formError.value = null;
  saving.value = true;
  try {
    await api('/teacher-assignments', { method: 'POST', body: { ...form } });
    form.groupId = null;
    void list.load();
    emit('changed');
  } catch (error) {
    formError.value = error instanceof ApiError ? error.message : 'Не удалось закрепить';
  } finally {
    saving.value = false;
  }
}

async function end(reason: string): Promise<void> {
  const target = selected.value;
  if (!target) return;
  if (
    await action.run(() =>
      api(`/teacher-assignments/${target.id}/end`, { method: 'POST', body: { reason } }),
    )
  ) {
    endOpen.value = false;
    void list.load();
    emit('changed');
  }
}

function isActive(item: TeacherAssignmentDto): boolean {
  return !item.endsAt || new Date(item.endsAt) > new Date();
}
</script>

<template>
  <div class="panel">
    <form class="iot-card panel__form" novalidate @submit.prevent="create">
      <h2 class="panel__heading">Новое закрепление</h2>
      <div class="panel__fields">
        <div class="iot-field">
          <label for="assign-teacher">Преподаватель</label>
          <Select
            v-model="form.teacherId"
            input-id="assign-teacher"
            :options="teachers.items.value"
            option-label="fullName"
            option-value="id"
            placeholder="Выберите"
            filter
            empty-message="Нет активных преподавателей"
            fluid
          />
        </div>
        <div class="iot-field">
          <label for="assign-group">Группа</label>
          <Select
            v-model="form.groupId"
            input-id="assign-group"
            :options="groups.items.value"
            option-label="name"
            option-value="id"
            placeholder="Выберите"
            filter
            empty-message="Нет действующих групп"
            fluid
          />
        </div>
        <div class="iot-field">
          <label for="assign-discipline">Дисциплина</label>
          <Select
            v-model="form.disciplineId"
            input-id="assign-discipline"
            :options="disciplines.items.value"
            option-label="name"
            option-value="id"
            placeholder="Выберите"
            filter
            empty-message="Нет действующих дисциплин"
            fluid
          />
        </div>
      </div>
      <Message v-if="formError" severity="error" role="alert">{{ formError }}</Message>
      <div class="iot-form-buttons">
        <Button type="submit" label="Закрепить" icon="pi pi-link" :loading="saving" />
      </div>
    </form>

    <div class="panel__check">
      <Checkbox v-model="includeEnded" input-id="assign-ended" binary />
      <label for="assign-ended">Показать снятые закрепления</label>
    </div>
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
          icon="pi pi-link"
          title="Закреплений нет"
          description="Пока преподаватель не закреплён за группой, он не видит её студентов."
        />
      </template>
      <Column header="Преподаватель">
        <template #body="{ data }">{{ data.teacher.fullName }}</template>
      </Column>
      <Column header="Группа">
        <template #body="{ data }">{{ data.group.name }}</template>
      </Column>
      <Column header="Дисциплина">
        <template #body="{ data }">{{ data.discipline.name }}</template>
      </Column>
      <Column header="Период">
        <template #body="{ data }">
          с {{ formatDateTime(data.startsAt) }}
          <template v-if="data.endsAt"><br />по {{ formatDateTime(data.endsAt) }}</template>
        </template>
      </Column>
      <Column header="Состояние">
        <template #body="{ data }">
          <StatusBadge v-if="isActive(data)" label="Действует" tone="success" />
          <StatusBadge v-else label="Снято" tone="neutral" icon="pi pi-minus-circle" />
        </template>
      </Column>
      <Column header="Действия">
        <template #body="{ data }">
          <Button
            v-if="isActive(data)"
            label="Снять"
            size="small"
            severity="danger"
            text
            @click="
              selected = data;
              endOpen = true;
            "
          />
        </template>
      </Column>
    </DataTable>

    <ActionDialog
      v-model:visible="endOpen"
      title="Снятие закрепления"
      :message="`${selected?.teacher.fullName} перестанет видеть студентов группы ${selected?.group.name} по дисциплине «${selected?.discipline.name}». Запись останется в истории.`"
      confirm-label="Снять"
      require-reason
      danger
      :busy="action.busy.value"
      :error="action.error.value"
      @confirm="end"
    />
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.panel__form {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.panel__heading {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1rem;
}

.panel__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--iot-space-3);
}

.panel__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}
</style>
