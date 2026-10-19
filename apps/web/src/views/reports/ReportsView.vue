<script setup lang="ts">
import {
  DASHBOARD_PERIOD_LABELS,
  DashboardPeriod,
  formatFullName,
  Permission,
  REPORT_KIND_DESCRIPTIONS,
  REPORT_KIND_LABELS,
  ReportFormat,
  ReportKind,
  type StudentPageDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, apiDownload, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';

/**
 * Раздел «Отчёты» (п. 4.10; FR-076–FR-080): индивидуальный отчёт студента, по группе, по реализации
 * ИОТ и по диагностике в PDF или XLSX. Группа и дисциплина берутся из шапки; период и формат —
 * здесь. Права и область данных проверяет сервер (FR-002).
 */
const route = useRoute();
const auth = useAuthStore();
const context = useContextStore();

const allowed = computed(
  () => auth.hasPermission(Permission.REPORTS_READ) && auth.hasPermission(Permission.STUDENTS_READ),
);

const period = ref<DashboardPeriod>(DashboardPeriod.ACADEMIC_YEAR);
const periodOptions = Object.values(DashboardPeriod).map((value) => ({
  value,
  label: DASHBOARD_PERIOD_LABELS[value],
}));
const format = ref<ReportFormat>(ReportFormat.PDF);

const students = ref<{ id: string; label: string }[]>([]);
const studentId = ref<string | null>(null);
const studentsError = ref<string | null>(null);

async function loadStudents(): Promise<void> {
  studentId.value = null;
  students.value = [];
  studentsError.value = null;
  if (!context.groupId) return;
  try {
    const page = await api<StudentPageDto>('/students', {
      query: { groupId: context.groupId, pageSize: 100 },
    });
    students.value = page.items.map((item) => ({
      id: item.id,
      label: `${formatFullName(item)} (${item.participantCode})`,
    }));
  } catch (caught) {
    studentsError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось загрузить список студентов';
  }
}
watch(() => context.groupId, loadStudents, { immediate: true });

const busy = ref<ReportKind | null>(null);
const done = ref<ReportKind | null>(null);
const error = ref<string | null>(null);

/** Чего не хватает, чтобы сформировать отчёт; null — можно. */
function missing(kind: ReportKind): string | null {
  if (kind === ReportKind.GROUP && !context.groupId) return 'Выберите группу в шапке.';
  if (kind === ReportKind.STUDENT && !context.groupId) return 'Выберите группу в шапке.';
  if (kind === ReportKind.STUDENT && !studentId.value) return 'Выберите студента.';
  return null;
}

async function download(kind: ReportKind): Promise<void> {
  busy.value = kind;
  done.value = null;
  error.value = null;
  try {
    const path = kind === ReportKind.STUDENT ? `students/${studentId.value}` : kind;
    await apiDownload(`/reports/${path}`, {
      query: {
        format: format.value,
        period: period.value,
        ...(kind === ReportKind.STUDENT
          ? {}
          : { groupId: context.groupId, disciplineId: context.disciplineId }),
      },
    });
    done.value = kind;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось сформировать отчёт';
  } finally {
    busy.value = null;
  }
}

const kinds = Object.values(ReportKind);
</script>

<template>
  <div class="iot-page reports">
    <h1>{{ route.meta.title }}</h1>
    <EmptyState
      v-if="!allowed"
      icon="pi pi-lock"
      title="Нет доступа к отчётам"
      description="Отчёты по студентам и группам формируют преподаватели. Исследователь получает обезличенные данные в разделе «Аналитика»."
    />
    <template v-else>
      <section class="iot-card reports__settings" aria-labelledby="reports-settings">
        <h2 id="reports-settings" class="reports__title">Параметры</h2>
        <div class="reports__fields">
          <div class="iot-field">
            <label id="reports-period-label" for="reports-period">Период</label>
            <Select
              v-model="period"
              input-id="reports-period"
              aria-labelledby="reports-period-label"
              :options="periodOptions"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
          <fieldset class="reports__format">
            <legend>Формат файла</legend>
            <div class="reports__choice">
              <RadioButton v-model="format" input-id="reports-pdf" value="pdf" />
              <label for="reports-pdf">PDF (для печати)</label>
            </div>
            <div class="reports__choice">
              <RadioButton v-model="format" input-id="reports-xlsx" value="xlsx" />
              <label for="reports-xlsx">XLSX (Excel)</label>
            </div>
          </fieldset>
        </div>
        <p class="reports__hint">
          Группа и дисциплина берутся из шапки:
          {{ context.group ? context.group.name : 'все доступные группы' }},
          {{ context.discipline ? context.discipline.name : 'все дисциплины' }}. В отчёте — дата
          формирования, период, показатели и автор. Нет данных — «Нет данных», не ноль. Каждый отчёт
          записывается в журнал аудита.
        </p>
      </section>

      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>

      <section
        v-for="kind in kinds"
        :key="kind"
        class="iot-card reports__item"
        :aria-labelledby="`report-${kind}`"
      >
        <div>
          <h2 :id="`report-${kind}`" class="reports__title">{{ REPORT_KIND_LABELS[kind] }}</h2>
          <p class="reports__hint">{{ REPORT_KIND_DESCRIPTIONS[kind] }}</p>
        </div>
        <div v-if="kind === ReportKind.STUDENT" class="iot-field">
          <label id="report-student-label" for="report-student">Студент</label>
          <Select
            v-model="studentId"
            input-id="report-student"
            aria-labelledby="report-student-label"
            :options="students"
            option-label="label"
            option-value="id"
            :placeholder="context.groupId ? 'Выберите студента' : 'Сначала выберите группу в шапке'"
            :disabled="!context.groupId"
            filter
            fluid
          />
          <small v-if="studentsError" role="alert">{{ studentsError }}</small>
        </div>
        <Message v-if="missing(kind)" severity="info" :closable="false">
          {{ missing(kind) }}
        </Message>
        <Message v-else-if="done === kind" severity="success" role="status">
          Файл сформирован.
        </Message>
        <div class="iot-form-buttons">
          <Button
            :label="`Сформировать ${format.toUpperCase()}`"
            icon="pi pi-download"
            :loading="busy === kind"
            :disabled="!!missing(kind) || busy !== null"
            @click="download(kind)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.reports {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.reports__settings,
.reports__item {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.reports__title {
  margin: 0;
  font-size: 1.125rem;
}

.reports__hint {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.reports__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: var(--iot-space-3);
}

.reports__format {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-5);
  margin: 0;
  padding: 0;
  border: 0;
}

.reports__choice {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}
</style>
