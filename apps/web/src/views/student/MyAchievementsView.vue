<script setup lang="ts">
import {
  type CabinetAssignmentsDto,
  type CabinetDiagnosticDto,
  type CabinetTrajectoryDto,
  studentAchievements,
} from '@iot/shared';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import MetricCard from '@/components/MetricCard.vue';
import StudentControlResults from '@/views/achievements/StudentControlResults.vue';
import { formatDate } from '@/utils/format';
import { scoreText } from '@/views/assignments/status';

/**
 * «Мои достижения» (п. 3.2, п. 6.5): завершённые траектории с итоговой оценкой, пройденные
 * этапы и контрольные точки, выполненные задания с результатами, пройденная диагностика
 * с понятной интерпретацией (FR-016). Только свои данные; без сравнения с другими студентами.
 */
const route = useRoute();
const trajectories = ref<CabinetTrajectoryDto[] | null>(null);
const assignments = ref<CabinetAssignmentsDto | null>(null);
const diagnostics = ref<CabinetDiagnosticDto[] | null>(null);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  error.value = null;
  try {
    [trajectories.value, assignments.value, diagnostics.value] = await Promise.all([
      api<CabinetTrajectoryDto[]>('/cabinet/trajectories'),
      api<CabinetAssignmentsDto>('/cabinet/assignments'),
      api<CabinetDiagnosticDto[]>('/cabinet/diagnostics'),
    ]);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить достижения';
  }
}
onMounted(load);

const data = computed(() =>
  trajectories.value && assignments.value && diagnostics.value
    ? studentAchievements({
        trajectories: trajectories.value,
        assignments: assignments.value.items,
        diagnostics: diagnostics.value,
      })
    : null,
);
const isEmpty = computed(
  () =>
    !!data.value &&
    data.value.completedTrajectories.length +
      data.value.completedStages.length +
      data.value.passedCheckpoints.length +
      data.value.completedAssignments.length +
      data.value.completedDiagnostics.length ===
      0,
);
</script>

<template>
  <div class="iot-page achievements">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="isEmpty"
      icon="pi pi-trophy"
      title="Достижений пока нет"
      description="Здесь появятся выполненные задания, пройденные этапы и контрольные точки вашей траектории."
    >
      <RouterLink to="/student/assignments">Перейти к заданиям</RouterLink>
    </EmptyState>
    <template v-else>
      <section class="achievements__cards" aria-label="Итоги">
        <MetricCard
          label="Пройдено этапов"
          :value="data.completedStages.length"
          icon="pi pi-flag"
        />
        <MetricCard
          label="Пройдено контрольных точек"
          :value="data.passedCheckpoints.length"
          icon="pi pi-check-square"
        />
        <MetricCard
          label="Выполнено заданий"
          :value="data.completedAssignments.length"
          icon="pi pi-file-check"
        />
        <MetricCard
          label="Пройдено диагностик"
          :value="data.completedDiagnostics.length"
          icon="pi pi-list-check"
        />
      </section>

      <section
        v-if="data.completedTrajectories.length > 0"
        class="iot-card"
        aria-labelledby="ach-routes"
      >
        <h2 id="ach-routes" class="achievements__title">Завершённые траектории</h2>
        <ul class="achievements__list">
          <li v-for="item in data.completedTrajectories" :key="item.id">
            <strong>{{ item.discipline.name }}</strong>
            <span class="achievements__meta">Завершена {{ formatDate(item.completedAt) }}</span>
            <p v-if="item.finalAssessment" class="achievements__text">
              Итог: {{ item.finalAssessment }}
            </p>
          </li>
        </ul>
      </section>

      <section class="iot-card" aria-labelledby="ach-stages">
        <h2 id="ach-stages" class="achievements__title">Этапы и контрольные точки</h2>
        <ul
          v-if="data.completedStages.length + data.passedCheckpoints.length > 0"
          class="achievements__list"
        >
          <li v-for="stage in data.completedStages" :key="stage.id">
            <span
              ><i class="pi pi-flag" aria-hidden="true" /> Этап «{{ stage.title }}» пройден</span
            >
            <span class="achievements__meta">{{ stage.discipline }}</span>
          </li>
          <li v-for="checkpoint in data.passedCheckpoints" :key="checkpoint.id">
            <span>
              <i class="pi pi-check-square" aria-hidden="true" /> Контрольная точка «{{
                checkpoint.title
              }}» пройдена
            </span>
            <span class="achievements__meta"
              >{{ checkpoint.discipline }} · {{ checkpoint.stage }}</span
            >
          </li>
        </ul>
        <p v-else class="achievements__meta">Пройденных этапов и контрольных точек пока нет.</p>
      </section>

      <section class="iot-card" aria-labelledby="ach-tasks">
        <h2 id="ach-tasks" class="achievements__title">Выполненные задания</h2>
        <ul v-if="data.completedAssignments.length > 0" class="achievements__list">
          <li v-for="item in data.completedAssignments" :key="item.id">
            <RouterLink :to="`/student/assignments/${item.id}`">{{
              item.assignment.title
            }}</RouterLink>
            <span class="achievements__meta">
              {{ item.discipline.name }}
              <template v-if="item.result && scoreText(item.result)">
                · результат {{ scoreText(item.result) }}
              </template>
              <template v-if="item.result">
                · принято {{ formatDate(item.result.assessedAt) }}</template
              >
            </span>
          </li>
        </ul>
        <p v-else class="achievements__meta">Выполненных заданий пока нет.</p>
      </section>

      <section class="iot-card" aria-labelledby="ach-diagnostics">
        <h2 id="ach-diagnostics" class="achievements__title">Пройденная диагностика</h2>
        <ul v-if="data.completedDiagnostics.length > 0" class="achievements__list">
          <li v-for="item in data.completedDiagnostics" :key="item.id">
            <strong>{{ item.title }}</strong>
            <span class="achievements__meta">Пройдена {{ formatDate(item.completedAt) }}</span>
            <p v-for="result in item.results" :key="result.scale" class="achievements__text">
              {{ result.scale }}: {{ result.text }}
            </p>
          </li>
        </ul>
        <p v-else class="achievements__meta">Пройденной диагностики пока нет.</p>
      </section>
    </template>
    <!-- Контрольные работы (этап 28) показываются и без траектории: их пишет вся группа. -->
    <section v-if="data" class="iot-card achievements__controls">
      <StudentControlResults
        source="/cabinet/control-results"
        hint="Баллы по шкале 0–100. Отсутствие и освобождение не считаются нулём."
      />
    </section>
  </div>
</template>

<style scoped>
.achievements {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.achievements h1 {
  margin: 0;
}

.achievements__controls {
  padding: var(--iot-space-4);
}

.achievements__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
  gap: var(--iot-space-3);
}

.achievements__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.125rem;
}

.achievements__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.achievements__list li {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  overflow-wrap: anywhere;
}

.achievements__meta {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.achievements__text {
  margin: 0;
}

@media (max-width: 599px) {
  .achievements__cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
