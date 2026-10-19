<script setup lang="ts">
import {
  DASHBOARD_PERIOD_LABELS,
  DASHBOARD_REFRESH_MS,
  type DashboardDto,
  DashboardPeriod,
  Permission,
} from '@iot/shared';
import Select from 'primevue/select';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, type RouteLocationRaw, useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import MetricCard from '@/components/MetricCard.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { TEACHER_NAV, TEACHER_SERVICE_NAV, visibleNavItems } from '@/navigation';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { formatDate, formatDateTime } from '@/utils/format';
import { assignmentBadge, dueText } from '@/views/assignments/status';
import {
  ACTIVITY_ICONS,
  ACTIVITY_LABELS,
  activityLink,
  OPEN_BADGE,
  periodQuery,
  upcomingLink,
} from './content';
import ProfileChart from './ProfileChart.vue';
import StageChart from './StageChart.vue';

/**
 * Главная панель преподавателя (п. 4.1, 6.2; FR-001–FR-005): шесть показателей со ссылками
 * на отфильтрованные списки (FR-003), диаграммы выполнения ИОТ и мотивационных профилей,
 * последние задания, активность студентов и предстоящие события. Группа и дисциплина — из шапки,
 * период — здесь (FR-004). Всё считается на сервере по студентам пользователя (FR-002); данные
 * перечитываются раз в минуту и при возврате на вкладку (FR-001). Пользователю без доступа
 * к студентам (администратор, исследователь) показываются ссылки на его разделы.
 */
const route = useRoute();
const auth = useAuthStore();
const context = useContextStore();
const canView = computed(
  () =>
    auth.hasPermission(Permission.STUDENTS_READ) && auth.hasPermission(Permission.MONITORING_READ),
);
const sections = computed(() =>
  visibleNavItems([...TEACHER_NAV, ...TEACHER_SERVICE_NAV], auth.hasPermission).filter(
    (item) => item.name !== 'home',
  ),
);

const period = ref<DashboardPeriod>(DashboardPeriod.ACADEMIC_YEAR);
const periodOptions = Object.values(DashboardPeriod).map((value) => ({
  value,
  label: DASHBOARD_PERIOD_LABELS[value],
}));
const data = ref<DashboardDto | null>(null);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  if (!canView.value) return;
  try {
    data.value = await api<DashboardDto>('/dashboard', {
      query: { groupId: context.groupId, disciplineId: context.disciplineId, period: period.value },
    });
    error.value = null;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить панель';
  }
}

watch(() => [context.groupId, context.disciplineId, period.value], load);

// FR-001: панель не показывает устаревшие данные — опрос и обновление при возврате на вкладку.
let timer: ReturnType<typeof setInterval> | undefined;
function onVisibility(): void {
  if (document.visibilityState === 'visible') void load();
}
onMounted(() => {
  void load();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void load();
  }, DASHBOARD_REFRESH_MS);
  document.addEventListener('visibilitychange', onVisibility);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisibility);
});

const canReview = computed(() => auth.hasPermission(Permission.ASSIGNMENTS_MANAGE));
const monitoringLink = (query: Record<string, string> = {}): RouteLocationRaw => ({
  path: '/monitoring',
  query: { ...periodQuery(data.value!.period), ...query },
});
const contextText = computed(() =>
  [context.group?.name, context.discipline?.name].filter(Boolean).join(', '),
);
const profilesEmpty = computed(
  () => !!data.value && data.value.profiles.NONE === data.value.profiles.total,
);
</script>

<template>
  <div class="iot-page dashboard">
    <div class="dashboard__head">
      <h1>{{ route.meta.title }}</h1>
      <div v-if="canView" class="dashboard__period">
        <label id="dashboard-period-label" for="dashboard-period">Период</label>
        <Select
          v-model="period"
          input-id="dashboard-period"
          aria-labelledby="dashboard-period-label"
          :options="periodOptions"
          option-label="label"
          option-value="value"
        />
      </div>
    </div>

    <template v-if="!canView">
      <EmptyState
        icon="pi pi-home"
        title="Панель показателей ведут преподаватели"
        description="Показатели студентов и траекторий доступны преподавателям. Ваши разделы:"
      >
        <ul class="dashboard__sections">
          <li v-for="item in sections" :key="item.name">
            <RouterLink :to="item.path"
              ><i :class="item.icon" aria-hidden="true" /> {{ item.label }}</RouterLink
            >
          </li>
        </ul>
      </EmptyState>
    </template>

    <ErrorState v-else-if="error && !data" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>

    <template v-else>
      <p v-if="error" class="dashboard__stale" role="alert">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        Не удалось обновить данные: {{ error }}. Показаны данные последней загрузки.
      </p>
      <p class="dashboard__muted">
        <template v-if="contextText">Показаны студенты: {{ contextText }}. </template>
        <template v-else>Показаны все ваши студенты. </template>
        Группа и дисциплина выбираются в шапке.
      </p>

      <section class="dashboard__cards" aria-label="Сводные показатели">
        <MetricCard
          label="Студентов"
          :value="data.cards.students"
          icon="pi pi-users"
          to="/students"
        />
        <MetricCard
          label="Активных ИОТ"
          :value="data.cards.activeTrajectories"
          icon="pi pi-directions"
          :to="monitoringLink({ status: 'ACTIVE' })"
        />
        <MetricCard
          label="Средний % выполнения маршрутов"
          :value="data.cards.averageProgress"
          unit="%"
          icon="pi pi-chart-line"
          :to="monitoringLink()"
        />
        <MetricCard
          label="Заданий на проверке"
          :value="data.cards.toReview"
          icon="pi pi-send"
          :to="canReview ? { path: '/assignments', query: { tab: 'review' } } : undefined"
        />
        <MetricCard
          label="Просроченных заданий"
          :value="data.cards.overdueAssignments"
          icon="pi pi-clock"
          :to="monitoringLink()"
        />
        <MetricCard
          label="Студентов, требующих внимания"
          :value="data.cards.needsAttention"
          icon="pi pi-flag"
          :to="{ path: '/students', query: { attention: '1' } }"
        />
      </section>

      <div class="dashboard__charts">
        <section class="iot-card" aria-labelledby="stages-title">
          <h2 id="stages-title" class="dashboard__title">Выполнение ИОТ</h2>
          <StageChart v-if="data.stages.length > 0" :bars="data.stages" />
          <EmptyState
            v-else
            icon="pi pi-directions"
            title="Активных ИОТ пока нет"
            description="Траектория создаётся из профиля студента после диагностики."
          >
            <RouterLink to="/students">Перейти к студентам</RouterLink>
          </EmptyState>
        </section>
        <section class="iot-card" aria-labelledby="profiles-title">
          <h2 id="profiles-title" class="dashboard__title">Мотивационные профили</h2>
          <EmptyState
            v-if="data.profiles.total === 0"
            icon="pi pi-users"
            title="Студентов нет"
            description="В выбранных группе и дисциплине нет действующих студентов."
          />
          <EmptyState
            v-else-if="profilesEmpty"
            icon="pi pi-list-check"
            title="Диагностика ещё не проводилась"
            description="Профили формируются по результатам диагностики."
          >
            <RouterLink to="/diagnostics">Назначить диагностику</RouterLink>
          </EmptyState>
          <ProfileChart v-else :distribution="data.profiles" />
        </section>
      </div>

      <div class="dashboard__lists">
        <section class="iot-card" aria-labelledby="recent-title">
          <h2 id="recent-title" class="dashboard__title">Последние задания</h2>
          <ul v-if="data.recentAssignments.length > 0" class="dashboard__list">
            <li v-for="item in data.recentAssignments" :key="item.id">
              <span class="dashboard__item-title">{{ item.title }}</span>
              <span class="dashboard__meta">
                <RouterLink
                  :to="{ path: `/students/${item.student.id}`, query: { tab: 'assignments' } }"
                >
                  {{ item.student.fullName }}
                </RouterLink>
                · {{ item.discipline }} · {{ dueText(item.dueAt) }}
              </span>
              <StatusBadge v-bind="assignmentBadge(item.status)" />
            </li>
          </ul>
          <p v-else class="dashboard__muted">За период задания не назначались.</p>
        </section>

        <section class="iot-card" aria-labelledby="activity-title">
          <h2 id="activity-title" class="dashboard__title">Последняя активность</h2>
          <ul v-if="data.activity.length > 0" class="dashboard__list">
            <li v-for="(item, index) in data.activity" :key="`${item.kind}-${item.at}-${index}`">
              <RouterLink :to="activityLink(item)" class="dashboard__item-title">
                <i :class="ACTIVITY_ICONS[item.kind]" aria-hidden="true" />
                {{ ACTIVITY_LABELS[item.kind]
                }}<template v-if="item.title">: {{ item.title }}</template>
              </RouterLink>
              <span class="dashboard__meta">
                {{ item.student.fullName }} · {{ formatDateTime(item.at) }}
              </span>
              <StatusBadge v-if="item.open" v-bind="OPEN_BADGE" />
            </li>
          </ul>
          <p v-else class="dashboard__muted">
            За период студенты не сдавали ответов и не обращались за помощью.
          </p>
        </section>

        <section class="iot-card" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" class="dashboard__title">
            Предстоящие контрольные точки и консультации
          </h2>
          <ul v-if="data.upcoming.length > 0" class="dashboard__list">
            <li v-for="item in data.upcoming" :key="`${item.kind}-${item.id}`">
              <RouterLink :to="upcomingLink(item)" class="dashboard__item-title">
                <i
                  :class="item.kind === 'CHECKPOINT' ? 'pi pi-flag' : 'pi pi-calendar'"
                  aria-hidden="true"
                />
                {{ item.kind === 'CHECKPOINT' ? formatDate(item.date) : formatDateTime(item.date) }}
                · {{ item.kind === 'CHECKPOINT' ? 'Контрольная точка' : 'Консультация' }} «{{
                  item.title
                }}»
              </RouterLink>
              <span class="dashboard__meta">
                {{ item.student.fullName
                }}<template v-if="item.discipline"> · {{ item.discipline }}</template
                ><template v-if="item.stageTitle"> · {{ item.stageTitle }}</template>
              </span>
            </li>
          </ul>
          <p v-else class="dashboard__muted">Ближайших контрольных точек и консультаций нет.</p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.dashboard__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-3);
}

.dashboard__head h1 {
  margin: 0;
}

.dashboard__period {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.dashboard__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.dashboard__stale {
  display: flex;
  gap: var(--iot-space-2);
  margin: 0;
  padding: var(--iot-space-2) var(--iot-space-3);
  border-radius: var(--iot-radius);
  background: var(--iot-tone-warning-bg);
  color: var(--iot-tone-warning-text);
}

.dashboard__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: var(--iot-space-3);
}

.dashboard__charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  gap: var(--iot-space-3);
}

.dashboard__lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: var(--iot-space-3);
}

.dashboard__charts > section,
.dashboard__lists > section {
  min-width: 0;
}

.dashboard__title {
  margin: 0 0 var(--iot-space-3);
  font-size: 1.125rem;
}

.dashboard__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.dashboard__list li {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-1);
  min-width: 0;
}

.dashboard__item-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.dashboard__meta {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.dashboard__sections {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (max-width: 599px) {
  /* Сетка показателей 2 × 3 на смартфоне (макет экрана 1). */
  .dashboard__cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
