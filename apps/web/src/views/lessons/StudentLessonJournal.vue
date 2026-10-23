<script setup lang="ts">
import type { StudentLessonJournalDto } from '@iot/shared';
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import { scoreLabel } from './scores';

/**
 * Наблюдения о студенте на занятиях в профиле (вкладка «Сопровождение», этап 25): средние оценки
 * по критериям и история по занятиям. Средняя считается только по оценкам 1–5: «Не наблюдалось»
 * и пропуски не превращаются в нули (FR-074). Видно только сотрудникам (FR-016).
 */
const props = defineProps<{ studentId: string }>();
const data = ref<StudentLessonJournalDto | null>(null);
const error = ref<string | null>(null);

const criterionName = computed(
  () => new Map((data.value?.criteria ?? []).map((item) => [item.id, item.name])),
);

async function load(): Promise<void> {
  error.value = null;
  try {
    data.value = await api<StudentLessonJournalDto>(`/students/${props.studentId}/lesson-journal`);
  } catch (failure) {
    error.value =
      failure instanceof ApiError ? failure.message : 'Не удалось загрузить наблюдения на занятиях';
  }
}

watch(() => props.studentId, load);
onMounted(load);
</script>

<template>
  <section class="lesson-history" aria-labelledby="profile-lesson-journal">
    <h2 id="profile-lesson-journal" class="lesson-history__title">Наблюдения на занятиях</h2>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="data.lessons === 0"
      icon="pi pi-calendar"
      title="Нет данных"
      description="Студент ещё не отмечен ни в одном журнале занятия. Журналы заполняются в разделе «Дисциплины» → «Занятия»."
    />
    <template v-else>
      <p class="lesson-history__muted">
        Занятий в журналах: {{ data.lessons }}, из них пропущено: {{ data.absences }}. Средняя — по
        оценкам 1–5, без отметок «Не наблюдалось».
      </p>
      <dl class="lesson-history__summary">
        <div v-for="item in data.summary" :key="item.criterionId" class="iot-card">
          <dt>{{ criterionName.get(item.criterionId) }}</dt>
          <dd>
            <strong v-if="item.mean !== null">{{ item.mean.toLocaleString('ru-RU') }}</strong>
            <StatusBadge v-else label="Нет данных" tone="neutral" />
            <span class="lesson-history__muted">
              оценок: {{ item.rated }}; не наблюдалось: {{ item.notObserved }}
            </span>
          </dd>
        </div>
      </dl>
      <ul class="lesson-history__records">
        <li v-for="record in data.records" :key="record.lessonId" class="iot-card">
          <div class="lesson-history__record-head">
            <strong>{{ formatDate(record.date) }}, {{ record.startTime }}</strong>
            <span>{{ record.discipline.name }}</span>
            <span class="lesson-history__muted">{{ record.teacher.fullName }}</span>
          </div>
          <StatusBadge
            v-if="record.absent"
            label="Отсутствовал"
            tone="warning"
            icon="pi pi-user-minus"
          />
          <dl v-else class="lesson-history__scores">
            <div v-for="criterion in data.criteria" :key="criterion.id">
              <dt>{{ criterion.name }}</dt>
              <dd>{{ scoreLabel(record.ratings, criterion.id) }}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.lesson-history {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.lesson-history__title {
  margin: 0;
  font-size: 1.125rem;
}

.lesson-history__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.lesson-history__summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: var(--iot-space-2);
  margin: 0;
}

.lesson-history__summary > div {
  padding: var(--iot-space-3);
}

.lesson-history__summary dt {
  font-weight: 600;
}

.lesson-history__summary dd {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: var(--iot-space-1) 0 0;
}

.lesson-history__records {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lesson-history__records > li {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding: var(--iot-space-3) var(--iot-space-4);
}

.lesson-history__record-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1) var(--iot-space-3);
}

.lesson-history__scores {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: var(--iot-space-1) var(--iot-space-3);
  margin: 0;
  font-size: 0.875rem;
}

.lesson-history__scores dt {
  color: var(--iot-color-muted);
}

.lesson-history__scores dd {
  margin: 0;
  font-weight: 600;
}
</style>
