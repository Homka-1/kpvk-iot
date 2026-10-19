<script setup lang="ts">
import {
  MONITORING_ROWS_LIMIT,
  type MonitoringDto,
  STUDENT_VISIBLE_TRAJECTORY_STATUSES,
  TRAJECTORY_STATUS_LABELS,
  type TrajectoryStatus,
} from '@iot/shared';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import MetricCard from '@/components/MetricCard.vue';
import ProgressIndicator from '@/components/ProgressIndicator.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useContextStore } from '@/stores/context';
import { supportBadge, trajectoryBadge } from '@/views/students/labels';
import { rowFacts, warningBadge, warningDue } from './content';
import DynamicsCharts from './DynamicsCharts.vue';

/**
 * Раздел «Мониторинг» (п. 4.8; FR-056–FR-062): действующие и завершённые ИОТ студентов
 * выбранных в шапке группы и дисциплины, поиск студента и период (FR-057), сводка, предупреждения
 * о просрочках и пропущенных контрольных точках (FR-058), динамика (FR-059) и показатели каждого
 * маршрута с переходом к подробностям и корректировке (FR-061). Учебная активность и диагностика
 * показаны раздельно; входы в систему не учитываются (FR-062).
 */
const route = useRoute();
const context = useContextStore();
const data = ref<MonitoringDto | null>(null);
const error = ref<string | null>(null);
// Переход с главной панели (FR-003): статус ИОТ и период — из адреса.
const queryText = (name: string) => {
  const value = route.query[name];
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
};
const search = ref('');
const from = ref(queryText('from'));
const to = ref(queryText('to'));
const status = ref<TrajectoryStatus | null>(
  STUDENT_VISIBLE_TRAJECTORY_STATUSES.find((item) => item === route.query.status) ?? null,
);
const statusOptions = STUDENT_VISIBLE_TRAJECTORY_STATUSES.map((value) => ({
  value,
  label: TRAJECTORY_STATUS_LABELS[value],
}));
const periodError = ref<string | null>(null);

async function load(): Promise<void> {
  error.value = null;
  periodError.value = null;
  if (from.value && to.value && to.value < from.value) {
    periodError.value = 'Конец периода раньше начала';
    return;
  }
  try {
    data.value = await api<MonitoringDto>('/monitoring', {
      query: {
        groupId: context.groupId,
        disciplineId: context.disciplineId,
        q: search.value.trim(),
        status: status.value,
        from: from.value,
        to: to.value,
      },
    });
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить мониторинг';
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [context.groupId, context.disciplineId, search.value, status.value, from.value, to.value],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 300);
  },
);
void load();

function resetPeriod(): void {
  from.value = '';
  to.value = '';
}
</script>

<template>
  <div class="iot-page monitoring">
    <h1>{{ route.meta.title }}</h1>
    <p class="monitoring__muted">
      Группа и дисциплина выбираются в шапке. Учебная активность и результаты диагностики
      учитываются раздельно; отсутствие входа в систему не считается снижением мотивации.
    </p>

    <div class="monitoring__filters" role="group" aria-label="Фильтры мониторинга">
      <IconField class="monitoring__search">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          placeholder="Ф. И. О. или код участника"
          aria-label="Поиск по студенту"
          fluid
        />
      </IconField>
      <Select
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="Любой статус ИОТ"
        show-clear
        aria-label="Фильтр по статусу ИОТ"
        class="monitoring__status"
      />
      <div class="iot-field">
        <label for="monitoring-from">Период с</label>
        <DateInput v-model="from" input-id="monitoring-from" />
      </div>
      <div class="iot-field">
        <label for="monitoring-to">по</label>
        <DateInput v-model="to" input-id="monitoring-to" :invalid="!!periodError" />
      </div>
      <Button
        label="Весь период"
        icon="pi pi-times"
        severity="secondary"
        text
        :disabled="!from && !to"
        @click="resetPeriod"
      />
    </div>
    <small v-if="periodError" class="iot-field-error" role="alert">{{ periodError }}</small>

    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="data.rows.length === 0"
      icon="pi pi-chart-line"
      :title="
        search || status || from || to ? 'Ничего не найдено' : 'Маршрутов для мониторинга нет'
      "
      :description="
        search || status || from || to
          ? 'Измените поиск или период.'
          : 'Здесь появятся утверждённые ИОТ студентов ваших групп и дисциплин.'
      "
    />
    <template v-else>
      <section class="monitoring__summary" aria-label="Сводные показатели">
        <MetricCard label="Маршрутов" :value="data.summary.trajectories" icon="pi pi-directions" />
        <MetricCard
          label="Средний прогресс"
          :value="data.summary.averageProgress"
          unit="%"
          icon="pi pi-percentage"
          hint="Доля выполненных заданий"
        />
        <MetricCard
          label="Просрочено заданий"
          :value="data.summary.overdueAssignments"
          icon="pi pi-clock"
        />
        <MetricCard
          label="Пропущено контрольных точек"
          :value="data.summary.missedCheckpoints"
          icon="pi pi-flag"
        />
        <MetricCard
          label="Нужно сопровождение"
          :value="data.summary.needsSupport"
          icon="pi pi-user-plus"
        />
        <MetricCard
          label="Требуют корректировки"
          :value="data.summary.needsCorrection"
          icon="pi pi-pencil"
        />
      </section>

      <section class="iot-card" aria-labelledby="warnings-title">
        <h2 id="warnings-title" class="monitoring__title">Предупреждения</h2>
        <p v-if="data.warnings.length === 0" class="monitoring__muted">
          Просроченных заданий и пропущенных контрольных точек нет.
        </p>
        <ul v-else class="monitoring__warnings">
          <li v-for="(warning, index) in data.warnings" :key="index">
            <StatusBadge v-bind="warningBadge(warning)" />
            <RouterLink :to="`/monitoring/${warning.trajectoryId}`">
              {{ warning.student.fullName }}
            </RouterLink>
            <span>
              {{ warning.discipline
              }}<template v-if="warning.stageTitle"> · этап «{{ warning.stageTitle }}»</template> ·
              {{ warning.title }} · срок {{ warningDue(warning) }}
            </span>
          </li>
        </ul>
      </section>

      <section class="iot-card" aria-labelledby="dynamics-title">
        <h2 id="dynamics-title" class="monitoring__title">Динамика показателей</h2>
        <DynamicsCharts :points="data.dynamics" />
      </section>

      <section aria-labelledby="rows-title" class="monitoring__rows">
        <h2 id="rows-title" class="monitoring__title">Маршруты студентов</h2>
        <p v-if="data.truncated" class="monitoring__muted" role="status">
          Показаны первые {{ MONITORING_ROWS_LIMIT }} маршрутов — выберите группу или дисциплину.
        </p>
        <article
          v-for="row in data.rows"
          :key="row.trajectoryId"
          class="iot-card monitoring__row"
          :aria-label="`${row.student.fullName}, ${row.discipline.name}`"
        >
          <div class="monitoring__row-head">
            <div>
              <h3>{{ row.student.fullName }}</h3>
              <p class="monitoring__muted">
                {{ row.student.group?.name ?? 'Без группы' }} · {{ row.discipline.name }} · версия
                {{ row.version }}
              </p>
            </div>
            <div class="monitoring__badges">
              <StatusBadge v-bind="trajectoryBadge(row.status)" />
              <StatusBadge
                v-if="row.student.supportStatus !== 'STANDARD'"
                v-bind="supportBadge(row.student.supportStatus)"
              />
            </div>
          </div>
          <ProgressIndicator label="Прогресс выполнения ИОТ" :value="row.progress.percent" />
          <dl class="monitoring__facts">
            <div v-for="fact in rowFacts(row)" :key="fact.label">
              <dt>{{ fact.label }}</dt>
              <dd>{{ fact.value }}</dd>
            </div>
          </dl>
          <div>
            <RouterLink :to="`/monitoring/${row.trajectoryId}`" class="p-button p-button-outlined">
              Подробнее и корректировка
            </RouterLink>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.monitoring,
.monitoring__rows {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.monitoring h1,
.monitoring h3 {
  margin: 0;
}

.monitoring h3 {
  font-size: 1rem;
}

.monitoring__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.0625rem;
}

.monitoring__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.monitoring__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: flex-end;
}

.monitoring__search {
  flex: 1 1 260px;
}

.monitoring__status {
  flex: 0 1 220px;
  min-width: 0;
}

.monitoring__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: var(--iot-space-3);
}

.monitoring__warnings {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.monitoring__warnings li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  overflow-wrap: anywhere;
}

.monitoring__row {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.monitoring__row-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  justify-content: space-between;
}

.monitoring__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: flex-start;
}

.monitoring__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
}

.monitoring__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}

.monitoring__facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
