<script setup lang="ts">
import type { QuestionnaireDetailDto, QuestionnaireSummaryDto } from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, newIdempotencyKey } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import { useAction, useList } from '@/views/disciplines/useList';
import CreateQuestionnaireDialog from './CreateQuestionnaireDialog.vue';

/** Список методик: действующая версия, черновик, копирование и архив (FR-017). */
const router = useRouter();
const includeArchived = ref(false);
const list = useList<QuestionnaireSummaryDto>(
  () => '/questionnaires',
  () => ({ includeArchived: includeArchived.value ? 'true' : null }),
);
const action = useAction();
const createOpen = ref(false);
const archiveOpen = ref(false);
const selected = ref<QuestionnaireSummaryDto | null>(null);

watch(includeArchived, list.load);
onMounted(list.load);

function open(id: string): void {
  void router.push({ name: 'questionnaire-editor', params: { id } });
}

/** Копия открывается в конструкторе как черновик версии 1. */
async function copy(item: QuestionnaireSummaryDto): Promise<void> {
  await action.run(async () => {
    const created = await api<QuestionnaireDetailDto>(`/questionnaires/${item.id}/copy`, {
      method: 'POST',
      headers: { 'Idempotency-Key': newIdempotencyKey() },
    });
    open(created.id);
  });
}

async function archive(reason: string): Promise<void> {
  const target = selected.value;
  if (!target) return;
  const ok = await action.run(() =>
    api(`/questionnaires/${target.id}/archive`, { method: 'POST', body: { reason } }),
  );
  if (ok) {
    archiveOpen.value = false;
    void list.load();
  }
}

async function restore(item: QuestionnaireSummaryDto): Promise<void> {
  if (await action.run(() => api(`/questionnaires/${item.id}/restore`, { method: 'POST' }))) {
    void list.load();
  }
}
</script>

<template>
  <div class="panel">
    <div class="panel__toolbar">
      <div class="panel__check">
        <Checkbox v-model="includeArchived" input-id="questionnaires-archived" binary />
        <label for="questionnaires-archived">Показать архивные</label>
      </div>
      <Button label="Создать методику" icon="pi pi-plus" @click="createOpen = true" />
    </div>
    <p v-if="action.error.value && !archiveOpen" class="iot-field-error" role="alert">
      {{ action.error.value }}
    </p>

    <ErrorState v-if="list.error.value" :message="list.error.value" retryable @retry="list.load" />
    <p v-else-if="!list.loaded.value" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="list.items.value.length === 0"
      icon="pi pi-list-check"
      title="Методик пока нет"
      description="Создайте методику: паспорт, вопросы, шкалы, ключи и правила интерпретации. Реальные методики (Ильина, Реан, Моросанова) вносятся после передачи заказчиком."
    />
    <div v-else class="panel__grid">
      <article v-for="item in list.items.value" :key="item.id" class="iot-card questionnaire">
        <h2 class="questionnaire__title">
          <RouterLink :to="{ name: 'questionnaire-editor', params: { id: item.id } }">
            {{ item.title }}
          </RouterLink>
        </h2>
        <div class="questionnaire__badges">
          <StatusBadge v-if="item.isDemo" label="Демо" tone="warning" icon="pi pi-flag" />
          <StatusBadge v-if="item.archivedAt" label="В архиве" tone="neutral" icon="pi pi-box" />
          <StatusBadge
            v-if="item.published"
            :label="`Действует версия ${item.published.versionNumber}`"
            tone="success"
          />
          <StatusBadge v-else label="Не опубликована" tone="neutral" icon="pi pi-minus-circle" />
          <StatusBadge
            v-if="item.draft"
            :label="`Черновик версии ${item.draft.versionNumber}`"
            tone="warning"
            icon="pi pi-pencil"
          />
        </div>
        <dl class="questionnaire__facts">
          <dt>Направление</dt>
          <dd>{{ item.direction?.name ?? 'Не указано' }}</dd>
          <dt>Вопросов</dt>
          <dd>{{ item.questionCount }}</dd>
          <dt>Изменена</dt>
          <dd>{{ formatDate(item.updatedAt) }}</dd>
        </dl>
        <div class="iot-form-buttons">
          <Button
            :label="item.archivedAt ? 'Просмотр' : 'Открыть'"
            icon="pi pi-pencil"
            size="small"
            text
            @click="open(item.id)"
          />
          <Button
            label="Копировать"
            icon="pi pi-copy"
            size="small"
            text
            :loading="action.busy.value"
            @click="copy(item)"
          />
          <Button
            v-if="item.archivedAt"
            label="Вернуть из архива"
            size="small"
            text
            @click="restore(item)"
          />
          <Button
            v-else
            label="В архив"
            icon="pi pi-box"
            size="small"
            severity="danger"
            text
            @click="
              selected = item;
              archiveOpen = true;
            "
          />
        </div>
      </article>
    </div>

    <CreateQuestionnaireDialog v-model:visible="createOpen" @created="open" />
    <ActionDialog
      v-model:visible="archiveOpen"
      title="Архивирование методики"
      :message="`Методика «${selected?.title}» скроется из списка и станет недоступна для изменения. Версии и результаты прохождений сохранятся.`"
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
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: var(--iot-space-3);
}

.questionnaire {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.questionnaire__title {
  margin: 0;
  font-size: 1.0625rem;
  overflow-wrap: anywhere;
}

.questionnaire__title a {
  color: var(--iot-color-heading);
}

.questionnaire__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1);
}

.questionnaire__facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--iot-space-1) var(--iot-space-3);
  margin: 0;
}

.questionnaire__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}

.questionnaire__facts dd {
  margin: 0;
}
</style>
