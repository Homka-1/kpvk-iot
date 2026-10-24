<script setup lang="ts">
import { type GradeOptionsDto, type GroupGradesDto, Permission } from '@iot/shared';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { deltaView, gradeText } from './format';
import GradeImportsDialog from './GradeImportsDialog.vue';
import ImportGradesDialog from './ImportGradesDialog.vue';

/**
 * Успеваемость группы по семестрам (этап 26): общий балл студентов (среднее средних по
 * дисциплинам) и средний балл группы по дисциплинам; при выборе второго семестра — сравнение.
 * Оценки загружают администратор и преподаватель группы. Нет оценок — «Нет данных», не ноль.
 */
const auth = useAuthStore();
const context = useContextStore();
const canManage = computed(() => auth.hasPermission(Permission.GRADES_MANAGE));

const options = ref<GradeOptionsDto | null>(null);
const data = ref<GroupGradesDto | null>(null);
const error = ref<string | null>(null);
const groupId = ref<string | null>(null);
const periodId = ref<string | null>(null);
const compareWith = ref<string | null>(null);
const importOpen = ref(false);
const importsOpen = ref(false);

const compareOptions = computed(() =>
  (options.value?.periods ?? []).filter((period) => period.id !== periodId.value),
);

async function loadOptions(): Promise<void> {
  error.value = null;
  try {
    const loaded = await api<GradeOptionsDto>('/grades/options');
    options.value = loaded;
    const groups = loaded.groups.map((group) => group.id);
    if (!groupId.value || !groups.includes(groupId.value)) {
      groupId.value =
        context.groupId && groups.includes(context.groupId) ? context.groupId : (groups[0] ?? null);
    }
    const periods = loaded.periods.map((period) => period.id);
    if (!periodId.value || !periods.includes(periodId.value)) {
      periodId.value = periods[0] ?? null;
    }
    if (compareWith.value && !periods.includes(compareWith.value)) compareWith.value = null;
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить семестры';
  }
}

async function load(): Promise<void> {
  data.value = null;
  if (!groupId.value || !periodId.value) return;
  error.value = null;
  try {
    data.value = await api<GroupGradesDto>('/grades/group', {
      query: {
        groupId: groupId.value,
        periodId: periodId.value,
        compareWith: compareWith.value,
      },
    });
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить оценки';
  }
}

function onPeriod(): void {
  if (compareWith.value === periodId.value) compareWith.value = null;
}

/** Перезагрузка после импорта или отмены: если выбор не изменился, наблюдатель не сработает. */
async function refresh(): Promise<void> {
  const selection = () => [groupId.value, periodId.value, compareWith.value].join('|');
  const before = selection();
  await loadOptions();
  if (selection() === before) await load();
}

watch(
  () => context.groupId,
  (value) => {
    if (value && options.value?.groups.some((group) => group.id === value)) groupId.value = value;
  },
);
watch([groupId, periodId, compareWith], load);
onMounted(refresh);
</script>

<template>
  <div class="grades">
    <div class="grades__toolbar">
      <div class="grades__filters">
        <div class="iot-field">
          <label for="grades-group">Группа</label>
          <Select
            v-model="groupId"
            input-id="grades-group"
            :options="options?.groups ?? []"
            option-label="name"
            option-value="id"
            placeholder="Выберите группу"
          />
        </div>
        <div class="iot-field">
          <label for="grades-period">Семестр</label>
          <Select
            v-model="periodId"
            input-id="grades-period"
            :options="options?.periods ?? []"
            option-label="label"
            option-value="id"
            placeholder="Нет семестров"
            @change="onPeriod"
          />
        </div>
        <div class="iot-field">
          <label for="grades-compare">Сравнить с семестром</label>
          <Select
            v-model="compareWith"
            input-id="grades-compare"
            :options="compareOptions"
            option-label="label"
            option-value="id"
            placeholder="Без сравнения"
            show-clear
          />
        </div>
      </div>
      <div v-if="canManage" class="grades__actions">
        <Button label="Импорт оценок" icon="pi pi-upload" size="small" @click="importOpen = true" />
        <Button
          label="Загрузки"
          icon="pi pi-history"
          size="small"
          outlined
          @click="importsOpen = true"
        />
      </div>
    </div>
    <p class="grades__hint">
      Средний балл по дисциплине — среднее её оценок за семестр; общий балл — среднее средних по
      дисциплинам. Баллы по шкале 0–100, округление до 0,1.
    </p>

    <ErrorState v-if="error" :message="error" retryable @retry="refresh" />
    <p v-else-if="!options" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="options.periods.length === 0"
      icon="pi pi-chart-bar"
      title="Оценки ещё не загружены"
      :description="
        canManage
          ? 'Загрузите оценки за семестр из файла CSV или XLSX кнопкой «Импорт оценок».'
          : 'Оценки за семестр загружают администратор и преподаватели групп.'
      "
    />
    <EmptyState
      v-else-if="options.groups.length === 0"
      icon="pi pi-users"
      title="Нет доступных групп"
      description="Вы не закреплены ни за одной группой."
    />
    <p v-else-if="!data" role="status">Загрузка оценок…</p>
    <template v-else>
      <section class="iot-card grades__summary" aria-labelledby="grades-overall">
        <h2 id="grades-overall" class="grades__title">
          {{ data.group.name }}: {{ data.period.label }}
        </h2>
        <p>
          Средний общий балл группы: <strong>{{ gradeText(data.overall) }}</strong>
          <template v-if="data.comparePeriod">
            · {{ data.comparePeriod.label }}: <strong>{{ gradeText(data.compareOverall) }}</strong>
            · изменение:
            <i :class="deltaView(data.delta).icon" aria-hidden="true" />
            <strong>{{ deltaView(data.delta).text }}</strong>
          </template>
        </p>
      </section>

      <section aria-labelledby="grades-disciplines">
        <h3 id="grades-disciplines" class="grades__subtitle">Средний балл по дисциплинам</h3>
        <EmptyState
          v-if="data.disciplines.length === 0"
          icon="pi pi-book"
          title="Нет данных"
          description="За выбранные семестры у студентов группы нет оценок."
        />
        <div v-else class="grades__scroll">
          <table class="grades__table">
            <thead>
              <tr>
                <th scope="col">Дисциплина</th>
                <th scope="col">{{ data.period.label }}</th>
                <th v-if="data.comparePeriod" scope="col">{{ data.comparePeriod.label }}</th>
                <th v-if="data.comparePeriod" scope="col">Изменение</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.disciplines" :key="item.discipline.id">
                <th scope="row">{{ item.discipline.name }}</th>
                <td>
                  {{ gradeText(item.mean) }}
                  <span v-if="item.students > 0" class="grades__sub">
                    студентов: {{ item.students }}
                  </span>
                </td>
                <td v-if="data.comparePeriod">{{ gradeText(item.compareMean) }}</td>
                <td v-if="data.comparePeriod">
                  <i :class="deltaView(item.delta).icon" aria-hidden="true" />
                  {{ deltaView(item.delta).text }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="grades-students">
        <h3 id="grades-students" class="grades__subtitle">Общий балл студентов</h3>
        <EmptyState
          v-if="data.students.length === 0"
          icon="pi pi-users"
          title="В группе нет студентов"
          description="Студенты появятся после добавления в разделе «Студенты»."
        />
        <div v-else class="grades__scroll">
          <table class="grades__table">
            <thead>
              <tr>
                <th scope="col">Студент</th>
                <th scope="col">{{ data.period.label }}</th>
                <th v-if="data.comparePeriod" scope="col">{{ data.comparePeriod.label }}</th>
                <th v-if="data.comparePeriod" scope="col">Изменение</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.students" :key="item.student.id">
                <th scope="row">
                  <RouterLink
                    :to="{
                      name: 'student-details',
                      params: { id: item.student.id },
                      query: { tab: 'diagnostics' },
                    }"
                  >
                    {{ item.student.fullName }}
                  </RouterLink>
                </th>
                <td>
                  {{ gradeText(item.overall) }}
                  <span v-if="item.disciplineCount > 0" class="grades__sub">
                    дисциплин: {{ item.disciplineCount }}
                  </span>
                </td>
                <td v-if="data.comparePeriod">{{ gradeText(item.compareOverall) }}</td>
                <td v-if="data.comparePeriod">
                  <i :class="deltaView(item.delta).icon" aria-hidden="true" />
                  {{ deltaView(item.delta).text }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <ImportGradesDialog v-model:visible="importOpen" @imported="refresh" />
    <GradeImportsDialog v-model:visible="importsOpen" @changed="refresh" />
  </div>
</template>

<style scoped>
.grades {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.grades__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--iot-space-3);
}

.grades__filters,
.grades__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--iot-space-2);
}

.grades__filters .iot-field {
  flex: 1 1 12rem;
  min-width: 0;
}

.grades__hint,
.grades__sub {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.grades__sub {
  display: block;
  font-size: 0.8125rem;
}

.grades__summary {
  padding: var(--iot-space-3) var(--iot-space-4);
}

.grades__summary p {
  margin: var(--iot-space-1) 0 0;
}

.grades__title {
  margin: 0;
  font-size: 1.125rem;
}

.grades__subtitle {
  margin: 0 0 var(--iot-space-2);
  font-size: 1rem;
}

.grades__scroll {
  overflow-x: auto;
}

.grades__table {
  width: 100%;
  border-collapse: collapse;
}

.grades__table th,
.grades__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
  vertical-align: top;
}

.grades__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.grades__table tbody th {
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
