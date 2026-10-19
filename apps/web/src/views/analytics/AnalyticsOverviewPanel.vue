<script setup lang="ts">
import {
  type AnalyticsDto,
  DASHBOARD_PERIOD_LABELS,
  DashboardPeriod,
  type GroupComparisonDto,
  MEASUREMENT_TYPE_LABELS,
  type ProfileDistributionDto,
  TRAJECTORY_STATUS_LABELS,
  type TrajectoryStatus,
} from '@iot/shared';
import Select from 'primevue/select';
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useContextStore } from '@/stores/context';
import { formatNumber } from '@/utils/format';
import { PROFILE_SLICES } from '@/views/dashboard/content';
import ProfileChart from '@/views/dashboard/ProfileChart.vue';
import DynamicsCharts from '@/views/monitoring/DynamicsCharts.vue';
import StatsTable, { type StatsRow } from './StatsTable.vue';

/**
 * Аналитика преподавателя (п. 4.10): выполнение ИОТ, академическая успешность, активность,
 * мотивационные профили, результативность заданий, динамика мотивации и сравнение до и после
 * сопровождения. По каждому показателю — описательные статистики в целом и по группам (FR-069,
 * FR-070). Группа и дисциплина — из шапки, период и методика — здесь. Считает сервер по студентам
 * пользователя (FR-002).
 */
const context = useContextStore();
const period = ref<DashboardPeriod>(DashboardPeriod.ACADEMIC_YEAR);
const periodOptions = Object.values(DashboardPeriod).map((value) => ({
  value,
  label: DASHBOARD_PERIOD_LABELS[value],
}));
const versionId = ref<string | null>(null);
const data = ref<AnalyticsDto | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    data.value = await api<AnalyticsDto>('/analytics', {
      query: {
        groupId: context.groupId,
        disciplineId: context.disciplineId,
        period: period.value,
        versionId: versionId.value,
      },
    });
    versionId.value = data.value.motivation.selected?.versionId ?? null;
    error.value = null;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить аналитику';
  } finally {
    loading.value = false;
  }
}

watch(() => [context.groupId, context.disciplineId, period.value], load);
onMounted(load);

function selectVersion(value: string): void {
  versionId.value = value;
  void load();
}

const versionOptions = computed(
  () =>
    data.value?.motivation.options.map((option) => ({
      value: option.versionId,
      label: `${option.title}, версия ${option.versionNumber}${option.isDemo ? ' (демо)' : ''}`,
    })) ?? [],
);

function groupRows(comparison: GroupComparisonDto): StatsRow[] {
  return [
    { key: 'total', label: 'Все группы', stats: comparison.total },
    ...comparison.groups.map((item) => ({
      key: item.group.id,
      label: item.group.name,
      stats: item.stats,
    })),
  ];
}

const statusList = computed(() =>
  Object.entries(data.value?.trajectories.statuses ?? {}).map(([status, count]) => ({
    label: TRAJECTORY_STATUS_LABELS[status as TrajectoryStatus],
    count,
  })),
);
const hasRoutes = computed(() => (data.value?.trajectories.progress.total.n ?? 0) > 0);
const hasStudents = computed(() => (data.value?.profiles.total.total ?? 0) > 0);

const profileRows = computed(() => {
  if (!data.value) return [];
  const row = (key: string, label: string, distribution: ProfileDistributionDto) => ({
    key,
    label,
    total: distribution.total,
    cells: PROFILE_SLICES.map((slice) => ({
      key: slice.key,
      count: distribution[slice.key],
      share:
        distribution.total > 0
          ? formatNumber(Math.round((distribution[slice.key] / distribution.total) * 1000) / 10)
          : null,
    })),
  });
  return [
    row('total', 'Все группы', data.value.profiles.total),
    ...data.value.profiles.groups.map((item) =>
      row(item.group.id, item.group.name, item.distribution),
    ),
  ];
});

const motivationRows = (scale: AnalyticsDto['motivation']['scales'][number]): StatsRow[] =>
  scale.measurements.map((item) => ({
    key: item.measurementType,
    label: MEASUREMENT_TYPE_LABELS[item.measurementType],
    stats: item.stats,
  }));
</script>

<template>
  <div class="analytics-overview">
    <div class="analytics-overview__filters">
      <div class="iot-field">
        <label id="analytics-period-label" for="analytics-period">Период</label>
        <Select
          v-model="period"
          input-id="analytics-period"
          aria-labelledby="analytics-period-label"
          :options="periodOptions"
          option-label="label"
          option-value="value"
        />
      </div>
      <p class="analytics-overview__hint">
        Группа и дисциплина выбираются в шапке. Учитываются только ваши студенты.
      </p>
    </div>

    <ErrorState v-if="error && !data" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="!hasStudents"
      icon="pi pi-chart-bar"
      title="Нет данных для аналитики"
      description="В выбранных группе и дисциплине нет студентов. Измените контекст в шапке."
    />
    <template v-else>
      <p v-if="data.truncated" class="analytics-overview__warning" role="status">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" /> Маршрутов слишком много:
        показатели ИОТ рассчитаны по первым из них. Сузьте группу или период.
      </p>

      <section class="iot-card analytics-section" aria-labelledby="analytics-trajectories">
        <h2 id="analytics-trajectories">Выполнение ИОТ</h2>
        <template v-if="hasRoutes">
          <ul class="analytics-overview__statuses">
            <li v-for="item in statusList" :key="item.label">
              {{ item.label }}: <strong>{{ item.count }}</strong>
            </li>
          </ul>
          <h3>Прогресс по заданиям маршрута</h3>
          <StatsTable
            caption="Прогресс по заданиям маршрута, %"
            :rows="groupRows(data.trajectories.progress)"
            unit="%"
          />
          <h3>Завершённые этапы маршрута</h3>
          <StatsTable
            caption="Доля завершённых этапов маршрута, %"
            :rows="groupRows(data.trajectories.stagesCompleted)"
            unit="%"
          />
          <p class="analytics-overview__note">Наблюдение — одна ИОТ в работе или завершённая.</p>
        </template>
        <EmptyState
          v-else
          icon="pi pi-map"
          title="Нет маршрутов за период"
          description="Показатели появятся после утверждения ИОТ."
        />
      </section>

      <section class="iot-card analytics-section" aria-labelledby="analytics-academic">
        <h2 id="analytics-academic">Академическая успешность и активность</h2>
        <template v-if="hasRoutes">
          <h3>Средний результат проверенных заданий</h3>
          <StatsTable
            caption="Средний результат проверенных заданий, %"
            :rows="groupRows(data.academic.averageScore)"
            unit="%"
          />
          <h3>Отправленные ответы</h3>
          <StatsTable
            caption="Отправленные ответы на одну ИОТ"
            :rows="groupRows(data.activity.submissions)"
          />
          <h3>Обращения за помощью</h3>
          <StatsTable
            caption="Обращения за помощью на одну ИОТ"
            :rows="groupRows(data.activity.helpRequests)"
          />
          <p class="analytics-overview__note">
            Учебная активность — сданные ответы и обращения. Входы в систему не учитываются и не
            считаются признаком снижения мотивации.
          </p>
          <h3>Динамика по неделям</h3>
          <DynamicsCharts :points="data.dynamics" />
        </template>
        <EmptyState
          v-else
          icon="pi pi-chart-line"
          title="Нет данных"
          description="Успешность и активность считаются по заданиям ИОТ."
        />
      </section>

      <section class="iot-card analytics-section" aria-labelledby="analytics-profiles">
        <h2 id="analytics-profiles">Распределение мотивационных профилей</h2>
        <ProfileChart :distribution="data.profiles.total" />
        <div
          class="analytics-overview__scroll"
          role="region"
          aria-label="Профили по группам"
          tabindex="0"
        >
          <table class="analytics-overview__table">
            <caption class="iot-visually-hidden">
              Распределение профилей по группам: число студентов и доля
            </caption>
            <thead>
              <tr>
                <th scope="col">Группа</th>
                <th scope="col">Студентов</th>
                <th v-for="slice in PROFILE_SLICES" :key="slice.key" scope="col">
                  {{ slice.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in profileRows" :key="row.key">
                <th scope="row">{{ row.label }}</th>
                <td>{{ row.total }}</td>
                <td v-for="cell in row.cells" :key="cell.key">
                  {{ cell.count }}<span v-if="cell.share !== null"> ({{ cell.share }}%)</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="iot-card analytics-section" aria-labelledby="analytics-assignments">
        <h2 id="analytics-assignments">Результативность заданий</h2>
        <div
          v-if="data.assignments.length > 0"
          class="analytics-overview__scroll"
          role="region"
          aria-label="Результативность заданий"
          tabindex="0"
        >
          <table class="analytics-overview__table">
            <caption class="iot-visually-hidden">
              Назначения, сдача, принятие и результат заданий библиотеки
            </caption>
            <thead>
              <tr>
                <th scope="col">Задание</th>
                <th scope="col">Назначено</th>
                <th scope="col">Сдано</th>
                <th scope="col">Принято</th>
                <th scope="col">Возвратов на доработку</th>
                <th scope="col">Средний результат</th>
                <th scope="col">Медиана</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.assignments" :key="item.assignmentId">
                <th scope="row">
                  {{ item.title }}
                  <small class="analytics-overview__muted">{{ item.discipline }}</small>
                </th>
                <td>{{ item.assigned }}</td>
                <td>{{ item.submitted }}</td>
                <td>{{ item.completed }}</td>
                <td>{{ item.returned }}</td>
                <td>
                  {{
                    item.score.mean === null ? 'Нет данных' : `${formatNumber(item.score.mean)}%`
                  }}
                </td>
                <td>
                  {{
                    item.score.median === null
                      ? 'Нет данных'
                      : `${formatNumber(item.score.median)}%`
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState
          v-else
          icon="pi pi-check-square"
          title="Заданий за период не назначалось"
          description="Результативность появится после назначения заданий библиотеки."
        />
      </section>

      <section class="iot-card analytics-section" aria-labelledby="analytics-motivation">
        <h2 id="analytics-motivation">Динамика мотивации: до и после сопровождения</h2>
        <template v-if="data.motivation.selected">
          <div class="iot-field analytics-overview__version">
            <label id="analytics-version-label" for="analytics-version">Методика</label>
            <Select
              :model-value="versionId"
              input-id="analytics-version"
              aria-labelledby="analytics-version-label"
              :options="versionOptions"
              option-label="label"
              option-value="value"
              :loading="loading"
              fluid
              @update:model-value="selectVersion"
            />
          </div>
          <p class="analytics-overview__note">
            Завершённых прохождений в расчёте: {{ data.motivation.completed }}. Незавершённые
            прохождения не учитываются: {{ data.motivation.incomplete }}.
            <template v-if="data.motivation.selected.comparableVersions.length > 0">
              Вместе с версией {{ data.motivation.selected.versionNumber }} учтены сопоставимые
              версии: {{ data.motivation.selected.comparableVersions.join(', ') }}.
            </template>
          </p>
          <article
            v-for="scale in data.motivation.scales"
            :key="scale.code"
            class="analytics-overview__scale"
          >
            <h3>{{ scale.name || scale.code }}</h3>
            <StatsTable
              :caption="`${scale.name}: баллы по замерам`"
              :rows="motivationRows(scale)"
              row-header="Замер"
            />
            <p v-if="scale.change" class="analytics-overview__change">
              <strong>Изменение «повторный − первичный»:</strong>
              <template v-if="scale.change.mean !== null">
                среднее {{ formatNumber(scale.change.mean) }}, медиана
                {{ formatNumber(scale.change.median!) }} (студентов с обоими замерами:
                {{ scale.change.n }}, без одного из замеров: {{ scale.change.missing }}).
              </template>
              <template v-else>нет данных — ни у кого нет обоих замеров с баллом.</template>
            </p>
            <p v-else class="analytics-overview__muted">
              Повторных замеров пока нет — сравнение до и после появится после них.
            </p>
          </article>
        </template>
        <EmptyState
          v-else
          icon="pi pi-list-check"
          title="Нет завершённых диагностик"
          description="Динамика появится после прохождения методик студентами."
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.analytics-overview {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.analytics-overview__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--iot-space-3);
}

.analytics-overview__hint,
.analytics-overview__note,
.analytics-overview__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.analytics-overview__muted {
  display: block;
  font-weight: 400;
}

.analytics-overview__warning {
  margin: 0;
  color: var(--iot-tone-warning-text);
}

.analytics-section {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  min-width: 0;
}

.analytics-section h2,
.analytics-section h3 {
  margin: 0;
}

.analytics-section h3 {
  font-size: 1rem;
}

.analytics-overview__statuses {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.analytics-overview__version {
  max-width: 32rem;
}

.analytics-overview__scale {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.analytics-overview__change {
  margin: 0;
}

.analytics-overview__scroll {
  /* Скрытая подпись таблицы позиционируется внутри контейнера, а не страницы (NFR-004). */
  position: relative;
  overflow-x: auto;
  max-width: 100%;
}

.analytics-overview__table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.analytics-overview__table th,
.analytics-overview__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: right;
}

.analytics-overview__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.analytics-overview__table th[scope='row'],
.analytics-overview__table thead th:first-child {
  text-align: left;
  min-width: 8rem;
}
</style>
