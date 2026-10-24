<script setup lang="ts">
import {
  GRADE_IMPORT_COLUMNS,
  GRADE_IMPORT_MAX_BYTES,
  GRADE_IMPORT_MAX_ROWS,
  type GradeImportPreviewDto,
  type GradeImportResultDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime, formatNumber } from '@/utils/format';
import { downloadCsv } from '@/views/students/download';

/**
 * Импорт оценок за семестр из CSV/XLSX (`ФИО | Группа | Учебный год | Семестр | Дисциплина |
 * Оценка`): выбор файла → предпросмотр с ошибками по строкам → импорт корректных строк.
 * Оценки сохраняются как есть; ошибочную загрузку можно отменить в списке «Загрузки».
 */
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ imported: [] }>();

const fileInput = ref<HTMLInputElement>();
const fileName = ref<string | null>(null);
const preview = ref<GradeImportPreviewDto | null>(null);
const result = ref<GradeImportResultDto | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
let idempotencyKey = newIdempotencyKey();

const validRows = computed(
  () => preview.value?.rows.filter((row) => row.errors.length === 0) ?? [],
);
const maxMegabytes = GRADE_IMPORT_MAX_BYTES / 1024 / 1024;

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
  downloadCsv('шаблон-оценок.csv', [
    GRADE_IMPORT_COLUMNS.map((column) => column.title),
    ['Иванов Иван Иванович', 'ПО-21', '2025/2026', '1', 'Информатика', '85'],
  ]);
}

async function onFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = null;
  preview.value = null;
  fileName.value = file.name;
  if (file.size > GRADE_IMPORT_MAX_BYTES) {
    error.value = `Файл больше ${maxMegabytes} МБ. Разделите его на части`;
    return;
  }
  const body = new FormData();
  body.append('file', file);
  busy.value = true;
  try {
    preview.value = await api<GradeImportPreviewDto>('/grades/import/preview', {
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
    result.value = await api<GradeImportResultDto>('/grades/import', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        fileName: fileName.value,
        rows: validRows.value.map((row) => ({
          line: row.line,
          studentName: row.studentName,
          groupName: row.groupName,
          academicYear: row.academicYear,
          semester: row.semester,
          disciplineName: row.disciplineName,
          score: row.score,
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
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Импорт оценок за семестр"
    :style="{ width: '64rem' }"
    :breakpoints="{ '960px': '95vw' }"
  >
    <div v-if="result" class="iot-form">
      <Message v-if="result.replayed" severity="info">
        Этот импорт уже был выполнен ранее, новых оценок не добавлено.
      </Message>
      <p v-else role="status">
        Загружено оценок: <strong>{{ result.created }}</strong
        >. Если файл загружен по ошибке, отмените загрузку в списке «Загрузки».
      </p>
      <div class="iot-form-buttons">
        <Button label="Готово" @click="visible = false" />
      </div>
    </div>

    <div v-else class="iot-form">
      <div class="import-info" role="note">
        <p>
          Файл CSV или XLSX до {{ maxMegabytes }} МБ, не более {{ GRADE_IMPORT_MAX_ROWS }} строк.
          Первая строка — заголовки колонок:
          {{ GRADE_IMPORT_COLUMNS.map((column) => `«${column.title}»`).join(', ') }}.
        </p>
        <p>
          Одна строка — одна оценка от 0 до 100; по дисциплине за семестр может быть несколько
          оценок. Учебный год — в формате 2025/2026, семестр — 1 или 2. Студент ищется в указанной
          группе по ФИО или фамилии с инициалами.
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
        <label for="grades-import-file">Файл с оценками</label>
        <input
          id="grades-import-file"
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
        <Message v-if="preview.alreadyImported" severity="warn" role="alert">
          Эти оценки уже загружены {{ formatDateTime(preview.alreadyImported.createdAt) }} из файла
          «{{ preview.alreadyImported.fileName }}». Повторная загрузка будет отклонена: сначала
          отмените прежнюю загрузку в списке «Загрузки».
        </Message>
        <p v-if="preview.rows.length > 0" role="status">
          Файл «{{ fileName }}»: готово к загрузке — <strong>{{ preview.validCount }}</strong
          >, с ошибками — <strong>{{ preview.invalidCount }}</strong
          >. Строки с ошибками не будут импортированы: исправьте их в файле и загрузите его снова.
        </p>
        <div v-if="preview.rows.length > 0" class="import-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Строка</th>
                <th scope="col">Студент</th>
                <th scope="col">Группа</th>
                <th scope="col">Семестр</th>
                <th scope="col">Дисциплина</th>
                <th scope="col">Оценка</th>
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
                <td>{{ row.resolved?.student.fullName ?? (row.studentName || '—') }}</td>
                <td>{{ row.resolved?.group.name ?? (row.groupName || '—') }}</td>
                <td>
                  {{
                    row.resolved?.period.label ??
                    ([row.academicYear, row.semester].filter(Boolean).join(', ') || '—')
                  }}
                </td>
                <td>{{ row.resolved?.discipline.name ?? (row.disciplineName || '—') }}</td>
                <td>{{ row.resolved ? formatNumber(row.resolved.score) : row.score || '—' }}</td>
                <td>
                  <StatusBadge
                    :label="row.errors.length > 0 ? 'Ошибка' : 'Готово'"
                    :tone="row.errors.length > 0 ? 'danger' : 'success'"
                  />
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
          :label="`Импортировать: ${validRows.length}`"
          icon="pi pi-upload"
          :disabled="validRows.length === 0 || !!preview.alreadyImported"
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
