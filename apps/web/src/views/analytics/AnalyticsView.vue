<script setup lang="ts">
import { type ComparabilityQuestionnaireDto, Permission } from '@iot/shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useAuthStore } from '@/stores/auth';
import ComparabilityPanel from './ComparabilityPanel.vue';
import ResultsExportPanel from './ResultsExportPanel.vue';

/**
 * Раздел «Аналитика» (п. 4.10). Сейчас — данные повторной диагностики для исследования (UC-06):
 * сопоставимость версий методик и обезличенная выгрузка результатов (FR-025). Блоки видны
 * по разрешениям исследователя; права проверяются и на сервере. Описательная статистика
 * и сравнение групп появятся позже.
 */
const route = useRoute();
const auth = useAuthStore();
const canRead = computed(() => auth.hasPermission(Permission.RESEARCH_READ));
const canManage = computed(() => auth.hasPermission(Permission.RESEARCH_MANAGE));
const canExport = computed(() => auth.hasPermission(Permission.RESEARCH_EXPORT));

const questionnaires = ref<ComparabilityQuestionnaireDto[] | null>(null);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  error.value = null;
  try {
    questionnaires.value = await api<ComparabilityQuestionnaireDto[]>(
      '/questionnaire-comparabilities',
    );
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить методики';
  }
}

function onUpdated(updated: ComparabilityQuestionnaireDto): void {
  questionnaires.value =
    questionnaires.value?.map((item) => (item.id === updated.id ? updated : item)) ?? null;
}

onMounted(() => {
  if (canRead.value) void load();
});
</script>

<template>
  <div class="iot-page analytics">
    <h1>{{ route.meta.title }}</h1>
    <template v-if="canRead">
      <ErrorState v-if="error" :message="error" retryable @retry="load" />
      <p v-else-if="!questionnaires" role="status">Загрузка…</p>
      <EmptyState
        v-else-if="questionnaires.length === 0"
        icon="pi pi-list-check"
        title="Нет опубликованных методик"
        description="Данные диагностики появятся после публикации методики и первых прохождений."
      />
      <template v-else>
        <ResultsExportPanel v-if="canExport" :questionnaires="questionnaires" />
        <ComparabilityPanel
          :questionnaires="questionnaires"
          :can-manage="canManage"
          @updated="onUpdated"
        />
      </template>
    </template>
    <EmptyState
      icon="pi pi-wrench"
      title="Описательная статистика и сравнение групп — в разработке"
      description="Эти функции появятся в следующих версиях приложения."
    />
  </div>
</template>

<style scoped>
.analytics {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}
</style>
