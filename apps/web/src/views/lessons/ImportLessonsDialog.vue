<script setup lang="ts">
import {
  LESSON_IMPORT_COLUMNS,
  LESSON_IMPORT_MAX_BYTES,
  LESSON_IMPORT_MAX_ROWS,
  type LessonImportPreviewDto,
  type LessonImportResultDto,
  type LessonImportRowDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import { downloadCsv } from '@/views/students/download';

/**
 * Импорт расписания из CSV/XLSX (`Дата | Время | Группа | Дисциплина | Преподаватель`):
 * выбор файла → предпросмотр с ошибками по строкам → импорт корректных строк. Занятия, которые
 * уже есть в расписании, пропускаются — файл можно загружать повторно.
 */
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ imported: [] }>();

const fileInput = ref<HTMLInputElement>();
const fileName = ref<string | null>(null);
const preview = ref<LessonImportPreviewDto | null>(null);
const result = ref<LessonImportResultDto | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
let idempotencyKey = newIdempotencyKey();

const validRows = computed(
  () => preview.value?.rows.filter((row) => row.errors.length === 0) ?? [],
);
const newRows = computed(() => validRows.value.filter((row) => !row.duplicate));
const maxMegabytes = LESSON_IMPORT_MAX_BYTES / 1024 / 1024;

watch(visible, (open) => {
  if (open) reset();
});

function reset(): void {
  fileName.value = null;
  preview.value = null;
  result.value = null;
  error.value = null;
  idempotencyKey = newIdempotencyKey();
  if (fileInput.value) fileInput.value.value = '';
}

function downloadTemplate(): void {
  downloadCsv('шаблон-расписания.csv', [
    LESSON_IMPORT_COLUMNS.map((column) => column.title),
    ['01.09.2025', '08:30', 'ПО-21', 'Информатика', 'Иванова А. П.'],
  ]);
}

async function onFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = null;
  preview.value = null;
  fileName.value = file.name;
  if (file.size > LESSON_IMPORT_MAX_BYTES) {
    error.value = `Файл больше ${maxMegabytes} МБ. Разделите его на части`;
    return;
  }
  const body = new FormData();
  body.append('file', file);
  busy.value = true;
  try {
    preview.value = await api<LessonImportPreviewDto>('/lessons/import/preview', {
      method: 'POST',
      body,
    });
    idempotencyKey = newIdempotencyKey();
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось прочитать файл';
  } finally {
    busy.value = false;
  }
}

async function runImport(): Promise<void> {
  error.value = null;
  busy.value = true;
  try {
    result.value = await api<LessonImportResultDto>('/lessons/import', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        rows: validRows.value.map((row) => ({
          line: row.line,
          date: row.date,
          time: row.time,
          groupName: row.groupName,
          disciplineName: row.disciplineName,
          teacherName: row.teacherName,
        })),
      },
    });
    emit('imported');
  } catch (failure) {
    if (failure instanceof ApiError) {
      const details = Object.entries(failure.fields).map(
        ([field, message]) => `строка ${field.replace('rows.', '')}: ${message}`,
      );
      error.value = [failure.message, ...details].join('. ');
    } else {
      error.value = 'Не удалось выполнить импорт';
    }
  } finally {
    busy.value = false;
  }
}

function rowStatus(row: LessonImportRowDto) {
  if (row.errors.length > 0) return { label: 'Ошибка', tone: 'danger' as const };
  if (row.duplicate) return { label: 'Уже есть', tone: 'neutral' as const };
  return { label: 'Готово', tone: 'success' as const };
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Импорт расписания"
    :style="{ width: '60rem' }"
    :breakpoints="{ '960px': '95vw' }"
  >
    <div v-if="result" class="iot-form">
      <Message v-if="result.replayed" severity="info">
        Этот импорт уже был выполнен ранее, новых занятий не создано.
      </Message>
      <p v-else role="status">
        Добавлено занятий: <strong>{{ result.created }}</strong
        >. Пропущено (уже были в расписании): <strong>{{ result.skipped }}</strong
        >.
      </p>
      <div class="iot-form-buttons">
        <Button label="Готово" @click="visible = false" />
      </div>
    </div>

    <div v-else class="iot-form">
      <div class="import-info" role="note">
        <p>
          Файл CSV или XLSX до {{ maxMegabytes }} МБ, не более {{ LESSON_IMPORT_MAX_ROWS }} строк.
          Первая строка — заголовки колонок:
          {{ LESSON_IMPORT_COLUMNS.map((column) => `«${column.title}»`).join(', ') }}.
        </p>
        <p>
          Дата — в формате дд.мм.гггг, время начала — ЧЧ:ММ (интервал «08:30–10:00» тоже подойдёт).
          Группа и дисциплина указываются названием, преподаватель — ФИО или фамилией с инициалами.
        </p>
        <Button
          label="Скачать шаблон"
          icon="pi pi-download"
          size="small"
          severity="secondary"
          text
          @click="downloadTemplate"
        />
      </div>

      <div class="iot-field">
        <label for="lessons-import-file">Файл расписания</label>
        <input
          id="lessons-import-file"
          ref="fileInput"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          :disabled="busy"
          @change="onFile"
        />
      </div>
      <p v-if="busy && !preview" role="status">Проверяем файл…</p>

      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>

      <template v-if="preview">
        <Message v-for="message in preview.fileErrors" :key="message" severity="error" role="alert">
          {{ message }}
        </Message>
        <p v-if="preview.rows.length > 0" role="status">
          Файл «{{ fileName }}»: новых занятий — <strong>{{ preview.validCount }}</strong
          >, уже есть в расписании — <strong>{{ preview.duplicateCount }}</strong
          >, с ошибками — <strong>{{ preview.invalidCount }}</strong
          >. Строки с ошибками не будут импортированы: исправьте их в файле и загрузите его снова.
        </p>
        <div v-if="preview.rows.length > 0" class="import-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Строка</th>
                <th scope="col">Дата и время</th>
                <th scope="col">Группа</th>
                <th scope="col">Дисциплина</th>
                <th scope="col">Преподаватель</th>
                <th scope="col">Проверка</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in preview.rows"
                :key="row.line"
                :class="{ 'import-row--invalid': row.errors.length > 0 }"
              >
                <td>{{ row.line }}</td>
                <td>
                  <template v-if="row.resolved">
                    {{ formatDate(row.resolved.date) }}, {{ row.resolved.startTime }}
                  </template>
                  <template v-else>{{ row.date || '—' }} {{ row.time }}</template>
                </td>
                <td>{{ row.resolved?.group.name ?? (row.groupName || '—') }}</td>
                <td>{{ row.resolved?.discipline.name ?? (row.disciplineName || '—') }}</td>
                <td>{{ row.resolved?.teacher.fullName ?? (row.teacherName || '—') }}</td>
                <td>
                  <StatusBadge v-bind="rowStatus(row)" />
                  <ul v-if="row.errors.length > 0" class="import-errors">
                    <li v-for="message in row.errors" :key="message">{{ message }}</li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button
          v-if="preview"
          :label="`Импортировать: ${newRows.length}`"
          icon="pi pi-upload"
          :disabled="newRows.length === 0"
          :loading="busy"
          @click="runImport"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.import-info {
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-info-border);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-info-text);
}

.import-info p {
  margin: 0 0 var(--iot-space-2);
}

.import-table {
  max-height: 24rem;
  overflow: auto;
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
}

.import-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.import-table th,
.import-table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
  vertical-align: top;
}

.import-table th {
  position: sticky;
  top: 0;
  background: var(--iot-navy-50);
  color: var(--iot-color-heading);
}

.import-row--invalid {
  background: var(--iot-tone-danger-bg);
}

.import-errors {
  margin: var(--iot-space-1) 0 0;
  padding-left: var(--iot-space-4);
  color: var(--iot-tone-danger-text);
}
</style>
