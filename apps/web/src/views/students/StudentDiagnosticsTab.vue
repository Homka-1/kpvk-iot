<script setup lang="ts">
import {
  DIAGNOSTIC_SOURCE_LABELS,
  type DiagnosticComparisonDto,
  MEASUREMENT_TYPE_LABELS,
  Permission,
  type StudentDiagnosticDto,
} from '@iot/shared';
import Button from 'primevue/button';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';
import AnswersHistoryDialog from '@/views/diagnostics/AnswersHistoryDialog.vue';
import DiagnosticComparison from '@/views/diagnostics/DiagnosticComparison.vue';
import ScoresTable from '@/views/diagnostics/ScoresTable.vue';
import { formatDuration, periodText, sessionBadge } from '@/views/diagnostics/sessions';

/**
 * Вкладка «Диагностика» профиля студента (п. 4.3; UC-01, шаг 10; FR-023): сравнение замеров
 * и динамика по шкалам (FR-015, FR-024; UC-06), затем все прохождения — методика, версия, даты,
 * время прохождения и баллы. Исходные ответы — только с отдельным разрешением.
 */
const props = defineProps<{ studentId: string }>();
const emit = defineEmits<{ changed: [] }>();
const auth = useAuthStore();
const canReadAnswers = computed(() => auth.hasPermission(Permission.DIAGNOSTIC_ANSWERS_READ));

const items = ref<StudentDiagnosticDto[] | null>(null);
const comparisons = ref<DiagnosticComparisonDto[]>([]);
const error = ref<string | null>(null);
const answersOpen = ref(false);
const selectedId = ref<string | null>(null);

async function load(): Promise<void> {
  error.value = null;
  try {
    const base = `/students/${props.studentId}/diagnostics`;
    const [loaded, compared] = await Promise.all([
      api<StudentDiagnosticDto[]>(base),
      api<DiagnosticComparisonDto[]>(`${base}/comparison`),
    ]);
    comparisons.value = compared;
    items.value = loaded;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить диагностику';
  }
}

watch(
  () => props.studentId,
  () => {
    items.value = null;
    void load();
  },
  { immediate: true },
);

function openAnswers(id: string): void {
  selectedId.value = id;
  answersOpen.value = true;
}

function onCorrected(): void {
  void load();
  emit('changed');
}
</script>

<template>
  <ErrorState v-if="error" :message="error" retryable @retry="load" />
  <p v-else-if="!items" role="status">Загрузка…</p>
  <EmptyState
    v-else-if="items.length === 0"
    icon="pi pi-list-check"
    title="Диагностика ещё не проводилась"
    description="Назначьте методику в разделе «Диагностика». Здесь появятся результаты с датами и версиями методик."
  />
  <template v-else>
    <section
      v-if="comparisons.length > 0"
      class="diagnostics__section"
      aria-labelledby="dynamics-title"
    >
      <h2 id="dynamics-title" class="diagnostics__heading">Динамика и сравнение замеров</h2>
      <DiagnosticComparison
        v-for="comparison in comparisons"
        :key="comparison.questionnaireId"
        :comparison="comparison"
      />
    </section>
    <h2 class="diagnostics__heading">Все прохождения</h2>
    <ul class="diagnostics">
      <li v-for="item in items" :key="item.id" class="iot-card diagnostics__item">
        <div class="diagnostics__head">
          <h2 class="diagnostics__title">{{ item.questionnaire.title }}</h2>
          <StatusBadge v-bind="sessionBadge(item.status)" />
        </div>
        <dl class="diagnostics__facts">
          <div>
            <dt>Версия методики</dt>
            <dd>{{ item.questionnaire.versionNumber }}</dd>
          </div>
          <div>
            <dt>Замер</dt>
            <dd>{{ MEASUREMENT_TYPE_LABELS[item.measurementType] }}</dd>
          </div>
          <div>
            <dt>Период</dt>
            <dd>{{ periodText(item.startsAt, item.endsAt) }}</dd>
          </div>
          <template v-if="item.status === 'COMPLETED'">
            <div>
              <dt>Пройдена</dt>
              <dd>{{ formatDateTime(item.completedAt) }}</dd>
            </div>
            <div>
              <dt>Способ</dt>
              <dd>{{ DIAGNOSTIC_SOURCE_LABELS[item.source] }}</dd>
            </div>
            <div>
              <dt>Время прохождения</dt>
              <dd>{{ formatDuration(item.durationSeconds) }}</dd>
            </div>
          </template>
        </dl>
        <template v-if="item.status === 'COMPLETED'">
          <ScoresTable :scores="item.scores" :caption="`Результаты: ${item.questionnaire.title}`" />
          <p v-if="item.revision > 1" class="diagnostics__muted">
            <i class="pi pi-history" aria-hidden="true" /> Результаты исправлены (ревизия
            {{ item.revision }})
          </p>
          <div v-if="canReadAnswers" class="iot-form-buttons">
            <Button
              label="Ответы и ревизии"
              icon="pi pi-eye"
              size="small"
              text
              @click="openAnswers(item.id)"
            />
          </div>
        </template>
        <p v-else class="diagnostics__muted">Результатов нет: прохождение не завершено.</p>
      </li>
    </ul>
  </template>
  <AnswersHistoryDialog
    v-if="canReadAnswers"
    v-model:visible="answersOpen"
    :session-id="selectedId"
    @corrected="onCorrected"
  />
</template>

<style scoped>
.diagnostics {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.diagnostics__section {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin-bottom: var(--iot-space-5);
}

.diagnostics__heading {
  margin: 0 0 var(--iot-space-3);
  font-size: 1.0625rem;
}

.diagnostics__section .diagnostics__heading {
  margin: 0;
}

.diagnostics__item {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.diagnostics__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.diagnostics__title {
  margin: 0;
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.diagnostics__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-5);
  margin: 0;
}

.diagnostics__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.75rem;
}

.diagnostics__facts dd {
  margin: 0;
}

.diagnostics__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
