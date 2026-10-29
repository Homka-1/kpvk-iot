<script setup lang="ts">
import { gradeDelta, type StudentGradesDto, type StudentSemesterDto } from '@iot/shared';
import Select from 'primevue/select';
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { formatNumber } from '@/utils/format';
import { deltaView, gradeText } from './format';

/**
 * Академическая успешность в профиле студента (вкладка «Диагностика», этап 26): средний балл
 * по дисциплинам и общий балл за каждый семестр, исходные оценки и сравнение двух семестров.
 * Нет оценок — «Нет данных», а не ноль (FR-074). Видно только сотрудникам.
 */
const props = defineProps<{ studentId: string }>();
const data = ref<StudentGradesDto | null>(null);
const error = ref<string | null>(null);
const currentId = ref<string | null>(null);
const previousId = ref<string | null>(null);

const semesters = computed(() => data.value?.semesters ?? []);
const periodOptions = computed(() => semesters.value.map((item) => item.period));
const byId = (id: string | null) => semesters.value.find((item) => item.period.id === id) ?? null;
const current = computed(() => byId(currentId.value));
const previous = computed(() => byId(previousId.value));

/** Строки сравнения: все дисциплины обоих семестров; пропуск — «Нет данных». */
const comparison = computed(() => {
  const a = current.value;
  const b = previous.value;
  if (!a || !b || a === b) return null;
  const mean = (semester: StudentSemesterDto, id: string) =>
    semester.disciplines.find((item) => item.discipline.id === id)?.mean ?? null;
  const disciplines = new Map(
    [...a.disciplines, ...b.disciplines].map((item) => [item.discipline.id, item.discipline]),
  );
  return {
    rows: [...disciplines.values()]
      .sort((x, y) => x.name.localeCompare(y.name, 'ru'))
      .map((discipline) => {
        const now = mean(a, discipline.id);
        const before = mean(b, discipline.id);
        return { discipline, now, before, delta: gradeDelta(now, before) };
      }),
    delta: gradeDelta(a.overall, b.overall),
  };
});

async function load(): Promise<void> {
  error.value = null;
  try {
    data.value = await api<StudentGradesDto>(`/students/${props.studentId}/grades`);
    // По умолчанию — последний семестр и предыдущий.
    currentId.value = data.value.semesters[0]?.period.id ?? null;
    previousId.value = data.value.semesters[1]?.period.id ?? null;
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить оценки';
  }
}

watch(() => props.studentId, load);
onMounted(load);
</script>

<template>
  <section class="student-grades" aria-labelledby="profile-grades">
    <h2 id="profile-grades" class="student-grades__title">Академическая успешность</h2>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="semesters.length === 0"
      icon="pi pi-chart-bar"
      title="Нет данных"
      description="Оценки за семестр ещё не загружены. Их загружают в разделе «Академические достижения» → «Оценки за семестр»."
    />
    <template v-else>
      <p class="student-grades__muted">
        Средний балл по дисциплине — среднее её оценок за семестр; общий балл — среднее средних по
        дисциплинам. Шкала 0–100.
      </p>
      <ul class="student-grades__semesters">
        <li v-for="semester in semesters" :key="semester.period.id" class="iot-card">
          <div class="student-grades__head">
            <h3>{{ semester.period.label }}</h3>
            <span class="student-grades__muted">
              {{ semester.groups.map((group) => group.name).join(', ') }}
            </span>
            <span>
              Общий балл: <strong>{{ gradeText(semester.overall) }}</strong>
            </span>
          </div>
          <dl class="student-grades__list">
            <div v-for="item in semester.disciplines" :key="item.discipline.id">
              <dt>{{ item.discipline.name }}</dt>
              <dd>
                <strong>{{ formatNumber(item.mean) }}</strong>
                <span class="student-grades__muted">
                  оценки: {{ item.scores.map(formatNumber).join('; ') }}
                </span>
              </dd>
            </div>
          </dl>
        </li>
      </ul>

      <section
        v-if="semesters.length > 1"
        class="iot-card student-grades__compare"
        aria-labelledby="profile-grades-compare"
      >
        <h3 id="profile-grades-compare">Сравнение семестров</h3>
        <div class="student-grades__selects">
          <div class="iot-field">
            <label for="grades-current">Семестр</label>
            <Select
              v-model="currentId"
              input-id="grades-current"
              :options="periodOptions"
              option-label="label"
              option-value="id"
            />
          </div>
          <div class="iot-field">
            <label for="grades-previous">Сравнить с</label>
            <Select
              v-model="previousId"
              input-id="grades-previous"
              :options="periodOptions"
              option-label="label"
              option-value="id"
            />
          </div>
        </div>
        <p v-if="!comparison" class="student-grades__muted">Выберите два разных семестра.</p>
        <div v-else class="student-grades__scroll">
          <table class="student-grades__table">
            <thead>
              <tr>
                <th scope="col">Дисциплина</th>
                <th scope="col">{{ current!.period.label }}</th>
                <th scope="col">{{ previous!.period.label }}</th>
                <th scope="col">Изменение</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in comparison.rows" :key="row.discipline.id">
                <th scope="row">{{ row.discipline.name }}</th>
                <td>{{ gradeText(row.now) }}</td>
                <td>{{ gradeText(row.before) }}</td>
                <td>
                  <i :class="deltaView(row.delta).icon" aria-hidden="true" />
                  {{ deltaView(row.delta).text }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Общий балл</th>
                <td>{{ gradeText(current!.overall) }}</td>
                <td>{{ gradeText(previous!.overall) }}</td>
                <td>
                  <i :class="deltaView(comparison.delta).icon" aria-hidden="true" />
                  {{ deltaView(comparison.delta).text }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.student-grades {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.student-grades__title {
  margin: 0;
  font-size: 1.125rem;
}

.student-grades h3 {
  margin: 0;
  font-size: 1rem;
}

.student-grades__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.student-grades__semesters {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.student-grades__semesters > li,
.student-grades__compare {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding: var(--iot-space-3) var(--iot-space-4);
}

.student-grades__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--iot-space-1) var(--iot-space-3);
}

.student-grades__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: var(--iot-space-2) var(--iot-space-3);
  margin: 0;
}

.student-grades__list dt {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.student-grades__list dd {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.student-grades__selects {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.student-grades__selects .iot-field {
  flex: 1 1 12rem;
  min-width: 0;
}

.student-grades__scroll {
  overflow-x: auto;
}

.student-grades__table {
  width: 100%;
  border-collapse: collapse;
}

.student-grades__table th,
.student-grades__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
  vertical-align: top;
}

.student-grades__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.student-grades__table tbody th,
.student-grades__table tfoot th {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.student-grades__table tfoot td {
  font-weight: 600;
}
</style>
