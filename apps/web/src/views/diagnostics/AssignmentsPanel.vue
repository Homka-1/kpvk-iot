<script setup lang="ts">
import {
  type DiagnosticAssignmentDetailDto,
  type DiagnosticAssignmentDto,
  MEASUREMENT_TYPE_LABELS,
} from '@iot/shared';
import Button from 'primevue/button';
import { onMounted, ref } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useList } from '@/views/disciplines/useList';
import AssignDialog from './AssignDialog.vue';
import AssignmentDetailDialog from './AssignmentDetailDialog.vue';
import { assignmentBadge, periodText } from './sessions';

/** Назначения диагностики (FR-018, FR-019): кому, какая версия методики, период и ход прохождения. */
const list = useList<DiagnosticAssignmentDto>(() => '/diagnostic-assignments');
const assignOpen = ref(false);
const detailOpen = ref(false);
const selectedId = ref<string | null>(null);

onMounted(list.load);

function open(id: string): void {
  selectedId.value = id;
  detailOpen.value = true;
}

function onCreated(created: DiagnosticAssignmentDetailDto): void {
  void list.load();
  open(created.id);
}

function targetText(item: DiagnosticAssignmentDto): string {
  return item.target.kind === 'group'
    ? `Группа ${item.target.group.name}`
    : `${item.target.student.fullName} (${item.target.student.participantCode})`;
}
</script>

<template>
  <div class="panel">
    <div class="panel__toolbar">
      <p class="panel__hint">Назначьте опубликованную методику группе или одному студенту.</p>
      <Button label="Назначить диагностику" icon="pi pi-send" @click="assignOpen = true" />
    </div>

    <ErrorState v-if="list.error.value" :message="list.error.value" retryable @retry="list.load" />
    <p v-else-if="!list.loaded.value" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="list.items.value.length === 0"
      icon="pi pi-send"
      title="Назначений пока нет"
      description="После назначения студенты получат уведомление и смогут пройти методику в своём кабинете."
    />
    <div v-else class="panel__grid">
      <article v-for="item in list.items.value" :key="item.id" class="iot-card assignment">
        <h2 class="assignment__title">{{ item.questionnaire.title }}</h2>
        <div class="assignment__badges">
          <StatusBadge v-bind="assignmentBadge(item.state)" />
          <StatusBadge
            v-if="item.questionnaire.isDemo"
            label="Демо"
            tone="warning"
            icon="pi pi-flag"
          />
        </div>
        <dl class="assignment__facts">
          <dt>Кому</dt>
          <dd>{{ targetText(item) }}</dd>
          <dt>Замер</dt>
          <dd>{{ MEASUREMENT_TYPE_LABELS[item.measurementType] }}</dd>
          <dt>Версия</dt>
          <dd>{{ item.questionnaire.versionNumber }}</dd>
          <dt>Период</dt>
          <dd>{{ periodText(item.startsAt, item.endsAt) }}</dd>
          <dt>Прошли</dt>
          <dd>{{ item.counts.COMPLETED }} из {{ item.counts.total }}</dd>
        </dl>
        <div class="iot-form-buttons">
          <Button label="Прохождения" icon="pi pi-users" size="small" text @click="open(item.id)" />
        </div>
      </article>
    </div>

    <AssignDialog v-model:visible="assignOpen" @created="onCreated" />
    <AssignmentDetailDialog
      v-model:visible="detailOpen"
      :assignment-id="selectedId"
      @changed="list.load"
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

.panel__hint {
  margin: 0;
  color: var(--iot-color-muted);
}

.panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: var(--iot-space-3);
}

.assignment {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.assignment__title {
  margin: 0;
  font-size: 1.0625rem;
  overflow-wrap: anywhere;
}

.assignment__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1);
}

.assignment__facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--iot-space-1) var(--iot-space-3);
  margin: 0;
}

.assignment__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}

.assignment__facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
