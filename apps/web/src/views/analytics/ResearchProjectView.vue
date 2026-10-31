<script setup lang="ts">
import {
  Permission,
  RESEARCH_GROUP_LABELS,
  RESEARCH_STATUS_TRANSITIONS,
  RESEARCH_TRANSITION_LABELS,
  type ResearchProjectDetailDto,
  type ResearchProjectStatus,
} from '@iot/shared';
import Button from 'primevue/button';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { measurementText, periodText, researchStatusBadge } from './research';
import ResearchDataPanel from './ResearchDataPanel.vue';
import ResearchMeasurementDialog from './ResearchMeasurementDialog.vue';
import ResearchParticipantsPanel from './ResearchParticipantsPanel.vue';
import ResearchProjectDialog from './ResearchProjectDialog.vue';

/**
 * Страница исследования (п. 4.10, UC-07): паспорт и статус, участники ЭГ и КГ, замеры, данные
 * и обезличенный экспорт. Изменения доступны с правом ведения исследований, пока исследование
 * готовится или проводится; права проверяет сервер. Исследование из архива можно удалить.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const canManage = computed(() => auth.hasPermission(Permission.RESEARCH_MANAGE));
const canExport = computed(() => auth.hasPermission(Permission.RESEARCH_EXPORT));
const id = computed(() => route.params.id as string);

const project = ref<ResearchProjectDetailDto | null>(null);
const error = ref<string | null>(null);
const notFound = ref(false);
const editing = ref(false);
const addingMeasurement = ref(false);
const transition = ref<ResearchProjectStatus | null>(null);
const transitionBusy = ref(false);
const transitionError = ref<string | null>(null);
const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

const transitions = computed(() =>
  project.value && canManage.value ? RESEARCH_STATUS_TRANSITIONS[project.value.status] : [],
);
const canEdit = computed(() => canManage.value && !!project.value?.editable);

async function load(): Promise<void> {
  error.value = null;
  try {
    project.value = await api<ResearchProjectDetailDto>(`/research-projects/${id.value}`);
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) notFound.value = true;
    else
      error.value =
        caught instanceof ApiError ? caught.message : 'Не удалось загрузить исследование';
  }
}

async function changeStatus(): Promise<void> {
  if (!transition.value) return;
  transitionBusy.value = true;
  transitionError.value = null;
  try {
    project.value = await api<ResearchProjectDetailDto>(`/research-projects/${id.value}/status`, {
      method: 'POST',
      body: { status: transition.value },
    });
    transition.value = null;
  } catch (caught) {
    transitionError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось изменить статус';
  } finally {
    transitionBusy.value = false;
  }
}

async function remove(): Promise<void> {
  deleting.value = true;
  deleteError.value = null;
  try {
    await api(`/research-projects/${id.value}`, { method: 'DELETE' });
    deleteOpen.value = false;
    await router.push('/analytics');
  } catch (caught) {
    deleteError.value = caught instanceof ApiError ? caught.message : 'Не удалось удалить';
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="iot-page research-project">
    <RouterLink to="/analytics" class="research-project__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> Аналитика
    </RouterLink>
    <EmptyState
      v-if="notFound"
      icon="pi pi-search"
      title="Исследование не найдено"
      description="Возможно, ссылка устарела."
    />
    <ErrorState v-else-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!project" role="status">Загрузка…</p>
    <template v-else>
      <header class="research-project__head">
        <div class="research-project__title">
          <h1>{{ project.title }}</h1>
          <StatusBadge v-bind="researchStatusBadge(project.status)" />
        </div>
        <p class="research-project__meta">
          Период: {{ periodText(project.startsOn, project.endsOn) }} ·
          {{ RESEARCH_GROUP_LABELS.EXPERIMENTAL }}: {{ project.participants.EXPERIMENTAL }} ·
          {{ RESEARCH_GROUP_LABELS.CONTROL }}: {{ project.participants.CONTROL }}
        </p>
        <p v-if="project.description" class="research-project__description">
          {{ project.description }}
        </p>
        <div v-if="canManage" class="research-project__actions">
          <Button
            v-if="canEdit"
            label="Паспорт"
            icon="pi pi-pencil"
            severity="secondary"
            outlined
            @click="editing = true"
          />
          <Button
            v-for="status in transitions"
            :key="status"
            :label="RESEARCH_TRANSITION_LABELS[status]"
            severity="secondary"
            outlined
            @click="
              transition = status;
              transitionError = null;
            "
          />
          <Button
            v-if="project.status === 'ARCHIVED'"
            label="Удалить"
            icon="pi pi-trash"
            severity="danger"
            text
            @click="
              deleteOpen = true;
              deleteError = null;
            "
          />
        </div>
        <p v-if="!project.editable" class="research-project__meta" role="status">
          <i class="pi pi-lock" aria-hidden="true" /> Исследование завершено: участники и замеры не
          меняются, данные доступны для анализа и экспорта.
        </p>
      </header>

      <ResearchParticipantsPanel
        :project-id="project.id"
        :editable="project.editable"
        :can-manage="canManage"
        @changed="load"
      />

      <section
        class="iot-card research-project__measurements"
        aria-labelledby="research-measurements-title"
      >
        <div class="research-project__section-head">
          <h2 id="research-measurements-title">Замеры</h2>
          <Button
            v-if="canEdit"
            label="Новый замер"
            icon="pi pi-plus"
            severity="secondary"
            outlined
            @click="addingMeasurement = true"
          />
        </div>
        <EmptyState
          v-if="project.measurementList.length === 0"
          icon="pi pi-list-check"
          title="Замеров пока нет"
          description="Замер фиксирует версию методики, тип (первичный или повторный) и период."
        />
        <ul v-else class="research-project__list">
          <li v-for="item in project.measurementList" :key="item.id">
            <strong>{{ item.title }}</strong>
            <span>{{ measurementText(item) }}</span>
            <span>Период: {{ periodText(item.startsOn, item.endsOn) }}</span>
          </li>
        </ul>
      </section>

      <ResearchDataPanel
        :project-id="project.id"
        :measurements="project.measurementList"
        :can-export="canExport"
      />

      <ResearchProjectDialog
        v-model:visible="editing"
        :project="project"
        @saved="(saved) => (project = saved)"
      />
      <ResearchMeasurementDialog
        v-model:visible="addingMeasurement"
        :project-id="project.id"
        @saved="(saved) => (project = saved)"
      />
      <ActionDialog
        :visible="!!transition"
        :title="transition ? RESEARCH_TRANSITION_LABELS[transition]! : ''"
        :message="
          transition === 'COMPLETED' || transition === 'ARCHIVED'
            ? 'После этого участники и замеры не меняются. Данные остаются доступны для анализа и экспорта.'
            : 'Исследование перейдёт в статус «Проводится».'
        "
        confirm-label="Подтвердить"
        :busy="transitionBusy"
        :error="transitionError"
        @update:visible="(value) => !value && (transition = null)"
        @confirm="changeStatus"
      />
      <ActionDialog
        v-model:visible="deleteOpen"
        title="Удалить исследование?"
        message="Исследование будет удалено вместе с участниками, кодами и замерами. Ответы диагностики и ИОТ студентов сохранятся. Действие записывается в журнал аудита и не отменяется."
        confirm-label="Удалить"
        danger
        :busy="deleting"
        :error="deleteError"
        @confirm="remove"
      />
    </template>
  </div>
</template>

<style scoped>
.research-project {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.research-project__back {
  align-self: flex-start;
}

.research-project__head {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.research-project__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-3);
}

.research-project__title h1 {
  margin: 0;
}

.research-project__meta,
.research-project__description {
  margin: 0;
  color: var(--iot-color-muted);
}

.research-project__actions,
.research-project__section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.research-project__section-head {
  justify-content: space-between;
}

.research-project__measurements {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.research-project__measurements h2 {
  margin: 0;
}

.research-project__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.research-project__list li {
  display: flex;
  flex-direction: column;
  padding-bottom: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
}

.research-project__list span {
  color: var(--iot-color-muted);
}
</style>
