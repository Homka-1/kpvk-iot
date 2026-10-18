<script setup lang="ts">
import { Permission, type TrajectoryPageDto } from '@iot/shared';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useAuthStore } from '@/stores/auth';
import TrajectoryCards from './TrajectoryCards.vue';

/**
 * Вкладка «Моя ИОТ» профиля студента: маршруты по дисциплинам (FR-045) и переход в конструктор
 * (UC-03). Центральная карта ИОТ в профиле — этап 12.
 */
const props = defineProps<{ studentId: string; archived: boolean }>();
const auth = useAuthStore();
const canManage = computed(() => auth.hasPermission(Permission.TRAJECTORIES_MANAGE));
const page = ref<TrajectoryPageDto | null>(null);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  if (!canManage.value) return;
  error.value = null;
  try {
    page.value = await api<TrajectoryPageDto>('/trajectories', {
      query: { studentId: props.studentId, pageSize: 100 },
    });
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить ИОТ';
  }
}

watch(() => props.studentId, load, { immediate: true });
</script>

<template>
  <EmptyState
    v-if="!canManage"
    icon="pi pi-lock"
    title="Нет доступа к ИОТ"
    description="Для просмотра нужно разрешение «Создание и корректировка ИОТ»."
  />
  <ErrorState v-else-if="error" :message="error" retryable @retry="load" />
  <p v-else-if="!page" role="status">Загрузка…</p>
  <div v-else class="student-trajectories">
    <div v-if="!archived">
      <RouterLink
        :to="{ name: 'trajectory-new', query: { studentId } }"
        class="p-button p-component"
      >
        <i class="pi pi-plus" aria-hidden="true" /> Создать ИОТ
      </RouterLink>
    </div>
    <EmptyState
      v-if="page.total === 0"
      icon="pi pi-directions"
      title="Индивидуальная траектория не создана"
      description="Создайте ИОТ: дисциплина, шаблон по мотивационному профилю, цели, этапы, задания и сроки."
    />
    <TrajectoryCards v-else :items="page.items" :show-student="false" />
  </div>
</template>

<style scoped>
.student-trajectories {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}
</style>
