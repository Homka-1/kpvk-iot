<script setup lang="ts">
import type { ReviewQueueItemDto } from '@iot/shared';
import Select from 'primevue/select';
import { reactive, watch } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useContextStore } from '@/stores/context';
import { formatDateTime } from '@/utils/format';
import { useList } from '@/views/disciplines/useList';
import { assignmentMeta, dueText } from './status';

/**
 * Очередь «На проверке» (AT-07): ответы студентов, которых преподаватель ведёт, — сначала те,
 * что ждут дольше. Фильтры — по группе и дисциплине из шапки; карточка ведёт на проверку.
 */
const context = useContextStore();
const filters = reactive({ groupId: context.groupId, disciplineId: context.disciplineId });
const queue = useList<ReviewQueueItemDto>(
  () => '/student-assignments/review',
  () => ({ groupId: filters.groupId, disciplineId: filters.disciplineId }),
);
watch(
  () => ({ ...filters }),
  () => void queue.load(),
  { immediate: true },
);
</script>

<template>
  <div class="queue">
    <div class="queue__toolbar">
      <Select
        v-model="filters.groupId"
        :options="context.groups"
        option-label="name"
        option-value="id"
        placeholder="Все группы"
        show-clear
        aria-label="Фильтр по группе"
        class="queue__filter"
      />
      <Select
        v-model="filters.disciplineId"
        :options="context.disciplines"
        option-label="name"
        option-value="id"
        placeholder="Все дисциплины"
        show-clear
        aria-label="Фильтр по дисциплине"
        class="queue__filter"
      />
    </div>
    <ErrorState
      v-if="queue.error.value"
      :message="queue.error.value"
      retryable
      @retry="queue.load"
    />
    <p v-else-if="!queue.loaded.value" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="queue.items.value.length === 0"
      icon="pi pi-check-square"
      title="Ответов на проверке нет"
      description="Когда студент отправит задание, оно появится здесь. Вы также получите уведомление."
    />
    <ul v-else class="queue__list">
      <li v-for="item in queue.items.value" :key="item.id">
        <RouterLink
          :to="{ name: 'assignment-review', params: { id: item.id } }"
          class="iot-card queue__card"
        >
          <span class="queue__name">{{ item.assignment.title }}</span>
          <span>
            {{ item.student.fullName }}
            <template v-if="item.student.group">· {{ item.student.group.name }}</template>
          </span>
          <span class="queue__muted">{{ item.discipline.name }} · {{ assignmentMeta(item) }}</span>
          <span class="queue__meta">
            <span class="queue__muted">
              Попытка {{ item.attemptNumber }} · отправлено {{ formatDateTime(item.submittedAt) }} ·
              срок: {{ dueText(item.dueAt) }}
            </span>
            <StatusBadge
              v-if="item.late"
              label="Отправлено после срока"
              tone="warning"
              icon="pi pi-clock"
            />
          </span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.queue {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.queue__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.queue__filter {
  flex: 1 1 200px;
  max-width: 320px;
}

.queue__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.queue__card {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  color: inherit;
  text-decoration: none;
}

.queue__card:hover {
  border-color: var(--iot-navy-100);
}

.queue__name {
  color: var(--iot-color-heading);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.queue__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1) var(--iot-space-2);
  align-items: center;
}

.queue__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
