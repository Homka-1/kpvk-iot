<script setup lang="ts">
import { type ComparabilityQuestionnaireDto, Permission } from '@iot/shared';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useAuthStore } from '@/stores/auth';
import AnalyticsOverviewPanel from './AnalyticsOverviewPanel.vue';
import ComparabilityPanel from './ComparabilityPanel.vue';
import ResearchProjectsPanel from './ResearchProjectsPanel.vue';
import ResultsExportPanel from './ResultsExportPanel.vue';

/**
 * Раздел «Аналитика» (п. 4.10). Вкладки по разрешениям (права проверяет и сервер):
 * «Показатели» — аналитика преподавателя по своим студентам; «Исследования» — исследовательский
 * режим (UC-07); «Диагностика: выгрузка и сопоставимость» — данные повторной диагностики (UC-06).
 */
const route = useRoute();
const auth = useAuthStore();
const canOverview = computed(
  () =>
    auth.hasPermission(Permission.ANALYTICS_READ) && auth.hasPermission(Permission.STUDENTS_READ),
);
const canResearch = computed(() => auth.hasPermission(Permission.RESEARCH_READ));
const canManage = computed(() => auth.hasPermission(Permission.RESEARCH_MANAGE));
const canExport = computed(() => auth.hasPermission(Permission.RESEARCH_EXPORT));

const tabs = computed(() => [
  ...(canOverview.value ? [{ value: 'overview', label: 'Показатели' }] : []),
  ...(canResearch.value
    ? [
        { value: 'research', label: 'Исследования' },
        { value: 'diagnostics', label: 'Диагностика: выгрузка и сопоставимость' },
      ]
    : []),
]);
const tab = ref(tabs.value[0]?.value ?? 'overview');

const questionnaires = ref<ComparabilityQuestionnaireDto[] | null>(null);
const error = ref<string | null>(null);

async function loadQuestionnaires(): Promise<void> {
  error.value = null;
  try {
    questionnaires.value = await api<ComparabilityQuestionnaireDto[]>(
      '/questionnaire-comparabilities',
    );
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить методики';
  }
}

watch(
  tab,
  (value) => {
    if (value === 'diagnostics' && !questionnaires.value) void loadQuestionnaires();
  },
  { immediate: true },
);

function onUpdated(updated: ComparabilityQuestionnaireDto): void {
  questionnaires.value =
    questionnaires.value?.map((item) => (item.id === updated.id ? updated : item)) ?? null;
}
</script>

<template>
  <div class="iot-page analytics">
    <h1>{{ route.meta.title }}</h1>
    <EmptyState
      v-if="tabs.length === 0"
      icon="pi pi-lock"
      title="Нет доступа к аналитике"
      description="Аналитика доступна преподавателям и исследователям."
    />
    <Tabs v-else v-model:value="tab" scrollable>
      <TabList>
        <Tab v-for="item in tabs" :key="item.value" :value="item.value">{{ item.label }}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-if="canOverview" value="overview">
          <AnalyticsOverviewPanel />
        </TabPanel>
        <TabPanel v-if="canResearch" value="research">
          <ResearchProjectsPanel />
        </TabPanel>
        <TabPanel v-if="canResearch" value="diagnostics">
          <div class="analytics__diagnostics">
            <ErrorState v-if="error" :message="error" retryable @retry="loadQuestionnaires" />
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
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.analytics__diagnostics {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}
</style>
