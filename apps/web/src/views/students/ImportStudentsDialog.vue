<script setup lang="ts">
import {
  formatFullName,
  STUDENT_IMPORT_COLUMNS,
  STUDENT_IMPORT_MAX_BYTES,
  STUDENT_IMPORT_MAX_ROWS,
  type StudentImportPreviewDto,
  type StudentImportResultDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { downloadCsv } from './download';

/**
 * Импорт студентов из CSV/XLSX (FR-006): выбор файла → предпросмотр с ошибками по строкам →
 * импорт корректных строк → список логинов и временных паролей (показывается один раз).
 */
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ imported: [] }>();

const fileInput = ref<HTMLInputElement>();
const fileName = ref<string | null>(null);
const preview = ref<StudentImportPreviewDto | null>(null);
const result = ref<StudentImportResultDto | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
let idempotencyKey = newIdempotencyKey();

const validRows = computed(
  () => preview.value?.rows.filter((row) => row.errors.length === 0) ?? [],
);
const maxMegabytes = STUDENT_IMPORT_MAX_BYTES / 1024 / 1024;

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
  downloadCsv('шаблон-импорта-студентов.csv', [
    STUDENT_IMPORT_COLUMNS.map((column) => column.title),
    ['Петров', 'Иван', 'Сергеевич', 'ПО-21', '', ''],
  ]);
}

async function onFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = null;
  preview.value = null;
  fileName.value = file.name;
  if (file.size > STUDENT_IMPORT_MAX_BYTES) {
    error.value = `Файл больше ${maxMegabytes} МБ. Разделите его на части`;
    return;
  }
  const body = new FormData();
  body.append('file', file);
  busy.value = true;
  try {
    preview.value = await api<StudentImportPreviewDto>('/students/import/preview', {
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
    result.value = await api<StudentImportResultDto>('/students/import', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { rows: validRows.value.map(({ errors: _errors, ...row }) => row) },
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

function downloadPasswords(): void {
  if (!result.value) return;
  downloadCsv('учётные-записи-студентов.csv', [
    ['ФИО', 'Группа', 'Код участника', 'Логин', 'Временный пароль'],
    ...result.value.created.map((item) => [
      formatFullName(item.student),
      item.student.group?.name ?? '',
      item.student.participantCode,
      item.login,
      item.temporaryPassword ?? '',
    ]),
  ]);
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Импорт студентов"
    :style="{ width: '56rem' }"
    :breakpoints="{ '960px': '95vw' }"
  >
    <div v-if="result" class="iot-form">
      <Message v-if="result.replayed" severity="info">
        Этот импорт уже был выполнен ранее, новых записей не создано. Пароли были показаны при
        первом импорте; при необходимости выдайте новые в карточках студентов.
      </Message>
      <template v-else>
        <p>
          Добавлено студентов: <strong>{{ result.created.length }}</strong
          >.
        </p>
        <Message severity="warn" role="status">
          Временные пароли показываются один раз. Сохраните список и передайте пароли студентам
          лично; при первом входе система попросит задать свой пароль.
        </Message>
      </template>
      <div class="import-table">
        <table>
          <thead>
            <tr>
              <th scope="col">ФИО</th>
              <th scope="col">Группа</th>
              <th scope="col">Логин</th>
              <th scope="col">Временный пароль</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in result.created" :key="item.student.id">
              <td>{{ formatFullName(item.student) }}</td>
              <td>{{ item.student.group?.name }}</td>
              <td>{{ item.login }}</td>
              <td>
                <code v-if="item.temporaryPassword">{{ item.temporaryPassword }}</code>
                <span v-else class="import-muted">уже показан</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="iot-form-buttons">
        <Button
          v-if="!result.replayed"
          label="Скачать список паролей (CSV)"
          icon="pi pi-download"
          severity="secondary"
          outlined
          @click="downloadPasswords"
        />
        <Button label="Готово" @click="visible = false" />
      </div>
    </div>

    <div v-else class="iot-form">
      <div class="import-info" role="note">
        <p>
          Файл CSV или XLSX до {{ maxMegabytes }} МБ, не более {{ STUDENT_IMPORT_MAX_ROWS }} строк.
          Первая строка — заголовки колонок:
        </p>
        <ul>
          <li v-for="column in STUDENT_IMPORT_COLUMNS" :key="column.key">
            «{{ column.title }}»{{ column.required ? ' — обязательно' : '' }}
          </li>
        </ul>
        <p>
          Группа указывается названием и должна быть среди ваших групп. Код участника и логин можно
          не заполнять — они сформируются автоматически.
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
        <label for="import-file">Файл со списком студентов</label>
        <input
          id="import-file"
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
          Файл «{{ fileName }}»: готово к импорту — <strong>{{ preview.validCount }}</strong
          >, с ошибками — <strong>{{ preview.invalidCount }}</strong
          >. Строки с ошибками не будут импортированы: исправьте их в файле и загрузите его снова.
        </p>
        <div v-if="preview.rows.length > 0" class="import-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Строка</th>
                <th scope="col">ФИО</th>
                <th scope="col">Группа</th>
                <th scope="col">Код / логин</th>
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
                <td>{{ formatFullName(row) || '—' }}</td>
                <td>{{ row.groupName || '—' }}</td>
                <td>
                  {{ row.participantCode ?? 'авто' }} /
                  {{ row.login ?? row.participantCode?.toLowerCase() ?? 'авто' }}
                </td>
                <td>
                  <StatusBadge v-if="row.errors.length === 0" label="Готово" tone="success" />
                  <template v-else>
                    <StatusBadge label="Ошибка" tone="danger" />
                    <ul class="import-errors">
                      <li v-for="message in row.errors" :key="message">{{ message }}</li>
                    </ul>
                  </template>
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
          :disabled="validRows.length === 0"
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

.import-info ul {
  margin: var(--iot-space-1) 0;
  padding-left: var(--iot-space-5);
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

.import-muted {
  color: var(--iot-color-muted);
}
</style>
