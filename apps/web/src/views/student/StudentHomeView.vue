<script setup lang="ts">
import {
  type CabinetAssignmentsDto,
  type CabinetDiagnosticDto,
  type CabinetFeedbackTrajectoryDto,
  type CabinetTrajectoryDto,
  studentAchievements,
  studentGoals,
  studentTeachers,
  type StudentGoal,
  studentTodos,
  type StudentTodo,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, type RouteLocationRaw, useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import ProgressIndicator from '@/components/ProgressIndicator.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { assignmentBadge, dueText } from '@/views/assignments/status';
import StudentRequestDialog from './StudentRequestDialog.vue';

/**
 * Главная кабинета студента (п. 6.5): четыре ответа — текущая цель, что выполнить сейчас,
 * чего уже достиг, где получить помощь. Без сложной аналитики. Только свои данные (AT-12):
 * маршруты, задания и диагностика из разделов кабинета.
 */
const TODO_LIMIT = 5;
const route = useRoute();
const trajectories = ref<CabinetTrajectoryDto[] | null>(null);
const assignments = ref<CabinetAssignmentsDto | null>(null);
const diagnostics = ref<CabinetDiagnosticDto[] | null>(null);
const error = ref<string | null>(null);
const requestKind = ref<'QUESTION' | 'CONSULTATION'>('QUESTION');
const requestOpen = ref(false);
const notice = ref<string | null>(null);

async function load(): Promise<void> {
  error.value = null;
  try {
    [trajectories.value, assignments.value, diagnostics.value] = await Promise.all([
      api<CabinetTrajectoryDto[]>('/cabinet/trajectories'),
      api<CabinetAssignmentsDto>('/cabinet/assignments'),
      api<CabinetDiagnosticDto[]>('/cabinet/diagnostics'),
    ]);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить данные';
  }
}
onMounted(load);

const ready = computed(() => !!trajectories.value && !!assignments.value && !!diagnostics.value);
const goals = computed(() => studentGoals(trajectories.value ?? []));
const todos = computed(() =>
  studentTodos({
    assignments: assignments.value?.items ?? [],
    choices: assignments.value?.choices ?? [],
    diagnostics: diagnostics.value ?? [],
  }),
);
const achievements = computed(() =>
  studentAchievements({
    trajectories: trajectories.value ?? [],
    assignments: assignments.value?.items ?? [],
    diagnostics: diagnostics.value ?? [],
  }),
);
const achievementFacts = computed(() =>
  [
    { count: achievements.value.completedTrajectories.length, label: 'Завершено траекторий' },
    { count: achievements.value.completedStages.length, label: 'Пройдено этапов' },
    { count: achievements.value.passedCheckpoints.length, label: 'Пройдено контрольных точек' },
    { count: achievements.value.completedAssignments.length, label: 'Выполнено заданий' },
    { count: achievements.value.completedDiagnostics.length, label: 'Пройдено диагностик' },
  ].filter((fact) => fact.count > 0),
);
const teachers = computed(() => studentTeachers(trajectories.value ?? []));
const feedbackTrajectories = computed<CabinetFeedbackTrajectoryDto[]>(() =>
  (trajectories.value ?? []).map((item) => ({
    id: item.id,
    disciplineName: item.discipline.name,
    status: item.status,
    stages: item.stages.map(({ id, title, sortOrder }) => ({ id, title, sortOrder })),
  })),
);

const goalMeta = (goal: StudentGoal) =>
  goal.stage
    ? `${goal.discipline} · этап ${goal.stage.position} из ${goal.stagesTotal} «${goal.stage.title}»`
    : goal.discipline;

function todoLink(item: StudentTodo): RouteLocationRaw {
  if (item.kind === 'ASSIGNMENT') return `/student/assignments/${item.id}`;
  if (item.kind === 'DIAGNOSTIC') return `/student/diagnostics/${item.id}`;
  return '/student/assignments';
}

const TODO_LABELS: Record<StudentTodo['kind'], string> = {
  ASSIGNMENT: 'Задание',
  CHOICE: 'Выберите задание',
  DIAGNOSTIC: 'Диагностика',
};

function ask(kind: 'QUESTION' | 'CONSULTATION'): void {
  requestKind.value = kind;
  requestOpen.value = true;
}

function onSent(): void {
  notice.value =
    requestKind.value === 'CONSULTATION'
      ? 'Запрос консультации отправлен преподавателю.'
      : 'Вопрос отправлен преподавателю. Ответ появится в разделе «Обратная связь».';
}
</script>

<template>
  <div class="iot-page student-home">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!ready" role="status">Загрузка…</p>
    <template v-else>
      <Message v-if="notice" severity="success" closable @close="notice = null">
        {{ notice }}
      </Message>

      <section class="iot-card" aria-labelledby="home-goal">
        <h2 id="home-goal" class="student-home__title">Моя текущая цель</h2>
        <ul v-if="goals.length > 0" class="student-home__list">
          <li v-for="goal in goals" :key="goal.trajectoryId" class="student-home__goal">
            <span class="student-home__meta">{{ goalMeta(goal) }}</span>
            <strong>{{ goal.goal ?? 'Цель этапа не указана' }}</strong>
            <ProgressIndicator label="Выполнено заданий этапа" :value="goal.progress.percent" />
          </li>
        </ul>
        <p v-else class="student-home__muted">
          Траектория пока не назначена. Преподаватель составит её после диагностики.
        </p>
        <RouterLink v-if="goals.length > 0" to="/student/trajectory">
          Открыть мою траекторию
        </RouterLink>
      </section>

      <section class="iot-card" aria-labelledby="home-todo">
        <h2 id="home-todo" class="student-home__title">Что выполнить сейчас</h2>
        <ul v-if="todos.length > 0" class="student-home__list">
          <li
            v-for="item in todos.slice(0, TODO_LIMIT)"
            :key="`${item.kind}-${item.id}`"
            class="student-home__todo"
          >
            <RouterLink :to="todoLink(item)" class="student-home__todo-title">
              {{ TODO_LABELS[item.kind] }}: {{ item.title }}
            </RouterLink>
            <span class="student-home__meta">{{ dueText(item.dueAt) }}</span>
            <StatusBadge v-if="item.status" v-bind="assignmentBadge(item.status)" />
          </li>
        </ul>
        <p v-else class="student-home__muted">Сейчас нет заданий и диагностик к выполнению.</p>
        <RouterLink v-if="todos.length > TODO_LIMIT" to="/student/assignments">
          Все задания ({{ todos.length }})
        </RouterLink>
      </section>

      <section class="iot-card" aria-labelledby="home-done">
        <h2 id="home-done" class="student-home__title">Чего я достиг</h2>
        <ul v-if="achievementFacts.length > 0" class="student-home__facts">
          <li v-for="fact in achievementFacts" :key="fact.label">
            <i class="pi pi-check-circle" aria-hidden="true" />
            {{ fact.label }}: <strong>{{ fact.count }}</strong>
          </li>
        </ul>
        <p v-else class="student-home__muted">
          Достижений пока нет: они появятся, когда вы выполните первые задания и этапы.
        </p>
        <RouterLink to="/student/achievements">Мои достижения</RouterLink>
      </section>

      <section class="iot-card" aria-labelledby="home-help">
        <h2 id="home-help" class="student-home__title">Где получить помощь</h2>
        <p v-if="teachers.length > 0" class="student-home__teachers">
          <i class="pi pi-user" aria-hidden="true" />
          {{ teachers.length === 1 ? 'Ваш преподаватель' : 'Ваши преподаватели' }}:
          {{ teachers.map((teacher) => teacher.fullName).join(', ') }}
        </p>
        <p v-else class="student-home__muted">
          Задайте вопрос — его получат преподаватели вашей группы.
        </p>
        <div class="student-home__actions">
          <Button label="Задать вопрос" icon="pi pi-question-circle" @click="ask('QUESTION')" />
          <Button
            label="Запросить консультацию"
            icon="pi pi-calendar"
            severity="secondary"
            outlined
            @click="ask('CONSULTATION')"
          />
        </div>
        <RouterLink to="/student/feedback">Все сообщения и консультации</RouterLink>
      </section>
    </template>

    <StudentRequestDialog
      v-model:visible="requestOpen"
      :kind="requestKind"
      :trajectories="feedbackTrajectories"
      @created="onSent"
      @requested="onSent"
    />
  </div>
</template>

<style scoped>
.student-home {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.student-home h1 {
  margin: 0;
}

.student-home section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-2);
}

.student-home__title {
  margin: 0;
  font-size: 1.125rem;
}

.student-home__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.student-home__goal,
.student-home__todo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-1);
  overflow-wrap: anywhere;
}

.student-home__goal :deep(.progress-indicator) {
  width: 100%;
}

.student-home__todo-title {
  font-weight: 600;
}

.student-home__meta,
.student-home__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.student-home__facts {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.student-home__facts .pi {
  color: var(--iot-tone-success-text);
}

.student-home__teachers {
  margin: 0;
}

.student-home__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}
</style>
