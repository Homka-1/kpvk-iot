<script setup lang="ts">
import { Permission, RESEARCH_GROUP_SHORT, type ResearchProjectDto } from '@iot/shared';
import Button from 'primevue/button';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { periodText, researchStatusBadge } from './research';
import ResearchProjectDialog from './ResearchProjectDialog.vue';

/** Исследования (п. 4.10, UC-07): список и создание. Работа с исследованием — на его странице. */
const auth = useAuthStore();
const router = useRouter();
const canManage = computed(() => auth.hasPermission(Permission.RESEARCH_MANAGE));
const projects = ref<ResearchProjectDto[] | null>(null);
const error = ref<string | null>(null);
const creating = ref(false);

async function load(): Promise<void> {
  error.value = null;
  try {
    projects.value = await api<ResearchProjectDto[]>('/research-projects');
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить исследования';
  }
}

onMounted(load);
</script>

<template>
  <div class="research-projects">
    <div class="research-projects__head">
      <p class="research-projects__hint">
        Участники исследования видны только по кодам. Экспериментальная и контрольная группы
        сравниваются по одинаковым шкалам и версиям методик.
      </p>
      <Button
        v-if="canManage"
        label="Новое исследование"
        icon="pi pi-plus"
        @click="creating = true"
      />
    </div>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!projects" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="projects.length === 0"
      icon="pi pi-flask"
      title="Исследований пока нет"
      :description="
        canManage
          ? 'Создайте исследование, включите учебные группы в ЭГ и КГ и зафиксируйте замеры.'
          : 'Исследования создаёт исследователь.'
      "
    />
    <ul v-else class="research-projects__list">
      <li v-for="project in projects" :key="project.id" class="iot-card research-projects__item">
        <div class="research-projects__title">
          <RouterLink :to="{ name: 'research-details', params: { id: project.id } }">
            {{ project.title }}
          </RouterLink>
          <StatusBadge v-bind="researchStatusBadge(project.status)" />
        </div>
        <p>
          Период: {{ periodText(project.startsOn, project.endsOn) }} ·
          {{ RESEARCH_GROUP_SHORT.EXPERIMENTAL }}: {{ project.participants.EXPERIMENTAL }} ·
          {{ RESEARCH_GROUP_SHORT.CONTROL }}: {{ project.participants.CONTROL }} · замеров:
          {{ project.measurements }}
        </p>
      </li>
    </ul>
    <ResearchProjectDialog
      v-model:visible="creating"
      @saved="(project) => router.push({ name: 'research-details', params: { id: project.id } })"
    />
  </div>
</template>

<style scoped>
.research-projects {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.research-projects__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-3);
}

.research-projects__hint {
  margin: 0;
  color: var(--iot-color-muted);
  max-width: 48rem;
}

.research-projects__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.research-projects__item p {
  margin: var(--iot-space-2) 0 0;
  color: var(--iot-color-muted);
}

.research-projects__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
  font-weight: 600;
}
</style>
