<script setup lang="ts">
import type { GradeImportDto } from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import { useAction } from '@/views/disciplines/useList';

/**
 * Загрузки оценок: преподавателю — свои, администратору — все. Ошибочную загрузку можно
 * отменить: её оценки удаляются, запись о загрузке остаётся (журнал аудита).
 */
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ changed: [] }>();

const items = ref<GradeImportDto[] | null>(null);
const error = ref<string | null>(null);
const cancelOpen = ref(false);
const selected = ref<GradeImportDto | null>(null);
const action = useAction();

async function load(): Promise<void> {
  error.value = null;
  try {
    items.value = await api<GradeImportDto[]>('/grades/imports');
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить список';
  }
}

watch(visible, (open) => {
  if (open) {
    items.value = null;
    void load();
  }
});

function askCancel(item: GradeImportDto): void {
  selected.value = item;
  action.error.value = null;
  cancelOpen.value = true;
}

async function cancel(): Promise<void> {
  const target = selected.value;
  if (!target) return;
  if (await action.run(() => api(`/grades/imports/${target.id}`, { method: 'DELETE' }))) {
    cancelOpen.value = false;
    emit('changed');
    void load();
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Загрузки оценок"
    :style="{ width: '48rem' }"
    :breakpoints="{ '960px': '95vw' }"
  >
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!items" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="items.length === 0"
      icon="pi pi-upload"
      title="Загрузок пока нет"
      description="Здесь появятся файлы с оценками, загруженные через «Импорт оценок»."
    />
    <ul v-else class="imports">
      <li v-for="item in items" :key="item.id" class="iot-card imports__item">
        <div class="imports__main">
          <strong>{{ item.fileName }}</strong>
          <span>
            {{ formatDateTime(item.createdAt) }} · {{ item.author.fullName }} · оценок:
            {{ item.rowCount }}
          </span>
          <span v-if="item.periods.length > 0" class="imports__muted">
            {{ item.periods.join('; ') }} · {{ item.groups.join(', ') }}
          </span>
        </div>
        <StatusBadge
          v-if="item.cancelledAt"
          :label="`Отменена ${formatDateTime(item.cancelledAt)}`"
          tone="neutral"
          icon="pi pi-ban"
        />
        <Button
          v-else-if="item.canCancel"
          label="Отменить загрузку"
          icon="pi pi-undo"
          size="small"
          severity="danger"
          outlined
          @click="askCancel(item)"
        />
      </li>
    </ul>

    <ActionDialog
      v-model:visible="cancelOpen"
      title="Отмена загрузки"
      :message="
        selected
          ? `Удалить ${selected.rowCount} оценок из файла «${selected.fileName}»? Запись о загрузке останется в списке.`
          : ''
      "
      confirm-label="Отменить загрузку"
      danger
      :busy="action.busy.value"
      :error="action.error.value"
      @confirm="cancel"
    />
  </Dialog>
</template>

<style scoped>
.imports {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.imports__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-3);
  padding: var(--iot-space-3) var(--iot-space-4);
}

.imports__main {
  display: flex;
  flex: 1 1 16rem;
  flex-direction: column;
  gap: var(--iot-space-1);
  min-width: 0;
  overflow-wrap: anywhere;
}

.imports__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
