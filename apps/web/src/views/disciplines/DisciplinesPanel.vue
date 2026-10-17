<script setup lang="ts">
import { type DisciplineDto, Permission } from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import DisciplineDialog from './DisciplineDialog.vue';
import { useAction, useList } from './useList';

/**
 * Дисциплины. Преподаватель видит свои дисциплины и группы, в которых их ведёт (FR-002);
 * администратор создаёт, изменяет и архивирует дисциплины.
 */
const emit = defineEmits<{ changed: [] }>();
const auth = useAuthStore();
const canManage = computed(() => auth.hasPermission(Permission.DISCIPLINES_MANAGE));
const includeArchived = ref(false);
const list = useList<DisciplineDto>(
  () => '/disciplines',
  () => ({ includeArchived: includeArchived.value ? 'true' : null }),
);
const action = useAction();
const editorOpen = ref(false);
const archiveOpen = ref(false);
const selected = ref<DisciplineDto | null>(null);

watch(includeArchived, list.load);
onMounted(list.load);

function edit(discipline: DisciplineDto | null): void {
  selected.value = discipline;
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
      api(`/disciplines/${target.id}/archive`, { method: 'POST', body: { reason } }),
    )
  ) {
    archiveOpen.value = false;
    onSaved();
  }
}

async function restore(discipline: DisciplineDto): Promise<void> {
  if (await action.run(() => api(`/disciplines/${discipline.id}/restore`, { method: 'POST' }))) {
    onSaved();
  }
}
</script>

<template>
  <div class="panel">
    <div v-if="canManage" class="panel__toolbar">
      <div class="panel__check">
        <Checkbox v-model="includeArchived" input-id="disciplines-archived" binary />
        <label for="disciplines-archived">Показать архивные</label>
      </div>
      <Button label="Добавить дисциплину" icon="pi pi-plus" @click="edit(null)" />
    </div>
    <p v-if="action.error.value && !archiveOpen" class="iot-field-error" role="alert">
      {{ action.error.value }}
    </p>

    <ErrorState v-if="list.error.value" :message="list.error.value" retryable @retry="list.load" />
    <p v-else-if="!list.loaded.value" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="list.items.value.length === 0"
      icon="pi pi-book"
      title="Дисциплин нет"
      :description="
        canManage
          ? 'Добавьте дисциплины, затем закрепите за ними преподавателей и группы.'
          : 'Вы пока не закреплены ни за одной дисциплиной. Закрепление выполняет администратор.'
      "
    />
    <div v-else class="panel__grid">
      <article
        v-for="discipline in list.items.value"
        :key="discipline.id"
        class="iot-card discipline"
      >
        <header class="discipline__header">
          <h2 class="discipline__name">{{ discipline.name }}</h2>
          <StatusBadge
            v-if="discipline.archivedAt"
            label="В архиве"
            tone="neutral"
            icon="pi pi-box"
          />
        </header>
        <p v-if="discipline.code" class="discipline__muted">Код: {{ discipline.code }}</p>
        <p v-if="discipline.description">{{ discipline.description }}</p>
        <dl class="discipline__facts">
          <dt>Группы</dt>
          <dd>
            {{
              discipline.groups.length > 0
                ? discipline.groups.map((group) => group.name).join(', ')
                : 'Нет закреплённых групп'
            }}
          </dd>
          <template v-if="canManage">
            <dt>Преподаватели</dt>
            <dd>
              {{
                discipline.teachers.length > 0
                  ? discipline.teachers.map((teacher) => teacher.fullName).join(', ')
                  : 'Не закреплены'
              }}
            </dd>
          </template>
        </dl>
        <div v-if="canManage" class="iot-form-buttons">
          <template v-if="discipline.archivedAt">
            <Button label="Вернуть из архива" size="small" text @click="restore(discipline)" />
          </template>
          <template v-else>
            <Button
              label="Изменить"
              icon="pi pi-pencil"
              size="small"
              text
              @click="edit(discipline)"
            />
            <Button
              label="В архив"
              icon="pi pi-box"
              size="small"
              severity="danger"
              text
              @click="
                selected = discipline;
                archiveOpen = true;
              "
            />
          </template>
        </div>
      </article>
    </div>

    <DisciplineDialog v-model:visible="editorOpen" :discipline="selected" @saved="onSaved" />
    <ActionDialog
      v-model:visible="archiveOpen"
      title="Архивирование дисциплины"
      :message="`Дисциплина «${selected?.name}» скроется из списков. Сначала снимите действующие закрепления преподавателей.`"
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

.panel__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: var(--iot-space-3);
}

.discipline {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.discipline p {
  margin: 0;
}

.discipline__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.discipline__name {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.0625rem;
}

.discipline__muted,
.discipline__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}

.discipline__facts {
  margin: 0;
}

.discipline__facts dd {
  margin: 0 0 var(--iot-space-2);
}
</style>
