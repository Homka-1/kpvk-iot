<script setup lang="ts">
import {
  ASSIGNMENT_CANCELLABLE_STATUSES,
  Permission,
  type StudentAssignmentDto,
} from '@iot/shared';
import Button from 'primevue/button';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useAction } from '@/views/disciplines/useList';
import { assignmentBadge, assignmentMeta, dueText } from './status';

/**
 * Вкладка «Задания» профиля студента (п. 4.3, п. 6.3): назначенные задания по дисциплинам,
 * которые пользователь ведёт в группе студента. Не начатое задание вне ИОТ можно отменить
 * с причиной. Просрочка и результаты — со сдачей заданий (этап 13).
 */
const props = defineProps<{ studentId: string }>();
const auth = useAuthStore();
const canManage = computed(() => auth.hasPermission(Permission.ASSIGNMENTS_MANAGE));
const items = ref<StudentAssignmentDto[] | null>(null);
const error = ref<string | null>(null);
const selected = ref<StudentAssignmentDto | null>(null);
const cancelOpen = ref(false);
const action = useAction();

async function load(): Promise<void> {
  if (!canManage.value) return;
  error.value = null;
  try {
    items.value = await api<StudentAssignmentDto[]>('/student-assignments', {
      query: { studentId: props.studentId },
    });
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить задания';
  }
}

const cancellable = (item: StudentAssignmentDto) =>
  !item.trajectory && ASSIGNMENT_CANCELLABLE_STATUSES.includes(item.status);

async function cancel(reason: string): Promise<void> {
  const target = selected.value;
  if (!target) return;
  const done = await action.run(() =>
    api(`/student-assignments/${target.id}/cancel`, { method: 'POST', body: { reason } }),
  );
  if (done) {
    cancelOpen.value = false;
    await load();
  }
}

watch(() => props.studentId, load, { immediate: true });
</script>

<template>
  <EmptyState
    v-if="!canManage"
    icon="pi pi-lock"
    title="Нет доступа к заданиям"
    description="Для просмотра нужно разрешение «Задания»."
  />
  <ErrorState v-else-if="error" :message="error" retryable @retry="load" />
  <p v-else-if="!items" role="status">Загрузка…</p>
  <EmptyState
    v-else-if="items.length === 0"
    icon="pi pi-file-edit"
    title="Заданий пока нет"
    description="Задания появятся после утверждения ИОТ или назначения из раздела «Задания»."
  />
  <ul v-else class="student-tasks">
    <li v-for="item in items" :key="item.id" class="iot-card student-tasks__item">
      <div class="student-tasks__head">
        <span class="student-tasks__name">{{ item.assignment.title }}</span>
        <StatusBadge v-bind="assignmentBadge(item.status)" />
      </div>
      <span class="student-tasks__muted">
        {{ item.discipline.name }} · {{ assignmentMeta(item) }}
        <template v-if="!item.trajectory">· вне маршрута</template>
      </span>
      <span v-if="item.choiceGroup" class="student-tasks__muted">
        Набор на выбор: «{{ item.choiceGroup.title }}»
      </span>
      <span class="student-tasks__muted">
        Срок: {{ dueText(item.dueAt) }} · назначил:
        {{ item.assignedBy?.fullName ?? 'нет данных' }}
      </span>
      <div v-if="cancellable(item)">
        <Button
          label="Отменить"
          icon="pi pi-ban"
          size="small"
          severity="danger"
          text
          @click="
            selected = item;
            cancelOpen = true;
          "
        />
      </div>
    </li>
  </ul>
  <ActionDialog
    v-model:visible="cancelOpen"
    title="Отмена задания"
    :message="
      selected?.choiceGroup && selected.status === 'OFFERED'
        ? `Набор «${selected.choiceGroup.title}» будет отменён целиком. Студент получит уведомление.`
        : `Задание «${selected?.assignment.title}» будет отменено. Студент получит уведомление.`
    "
    confirm-label="Отменить задание"
    require-reason
    danger
    :busy="action.busy.value"
    :error="action.error.value"
    @confirm="cancel"
  />
</template>

<style scoped>
.student-tasks {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.student-tasks__item {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.student-tasks__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.student-tasks__name {
  color: var(--iot-color-heading);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.student-tasks__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
