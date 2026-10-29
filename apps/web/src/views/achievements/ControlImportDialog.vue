<script setup lang="ts">
import {
  CONTROL_IMPORT_COLUMNS,
  CONTROL_IMPORT_MAX_BYTES,
  CONTROL_IMPORT_MAX_ROWS,
  type ControlImportPreviewDto,
  type ControlImportRowDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { downloadCsv } from '@/views/students/download';
import { resultText } from './format';

/**
 * Загрузка результатов группы из CSV/XLSX (`ФИО | Результат`): файл разбирается на сервере,
 * строки сопоставляются со студентами ведомости. Результаты только подставляются в ведомость —
 * сохраняет её преподаватель после проверки.
 */
const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ workId: string; groupId: string; groupName: string }>();
const emit = defineEmits<{ apply: [rows: ControlImportRowDto[]] }>();

const fileInput = ref<HTMLInputElement>();
const fileName = ref<string | null>(null);
const preview = ref<ControlImportPreviewDto | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

const validRows = computed(
  () => preview.value?.rows.filter((row) => row.errors.length === 0) ?? [],
);
const maxMegabytes = CONTROL_IMPORT_MAX_BYTES / 1024 / 1024;

watch(visible, (open) => {
  if (!open) return;
  fileName.value = null;
  preview.value = null;
  error.value = null;
  if (fileInput.value) fileInput.value.value = '';
});

function downloadTemplate(): void {
  downloadCsv('шаблон-результатов.csv', [
    CONTROL_IMPORT_COLUMNS.map((column) => column.title),
    ['Иванов Иван Иванович', '85'],
    ['Петрова Анна Сергеевна', 'Отсутствовал'],
  ]);
}

async function onFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = null;
  preview.value = null;
  fileName.value = file.name;
  if (file.size > CONTROL_IMPORT_MAX_BYTES) {
    error.value = `Файл больше ${maxMegabytes} МБ`;
    return;
  }
  const body = new FormData();
  body.append('file', file);
  busy.value = true;
  try {
    preview.value = await api<ControlImportPreviewDto>(
      `/control-works/${props.workId}/groups/${props.groupId}/import`,
      { method: 'POST', body },
    );
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось прочитать файл';
  } finally {
    busy.value = false;
  }
}

function apply(): void {
  emit('apply', validRows.value);
  visible.value = false;
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="`Результаты из файла: ${groupName}`"
    :style="{ width: '48rem' }"
    :breakpoints="{ '800px': '95vw' }"
  >
    <div class="iot-form">
      <div class="import-info" role="note">
        <p>
          Файл CSV или XLSX до {{ maxMegabytes }} МБ, не более {{ CONTROL_IMPORT_MAX_ROWS }} строк.
          Первая строка — заголовки:
          {{ CONTROL_IMPORT_COLUMNS.map((column) => `«${column.title}»`).join(', ') }}.
        </p>
        <p>
          Результат — балл от 0 до 100 или отметка: «Отсутствовал», «Не выполнил», «Освобождён».
          Пустая клетка — нет данных. Результаты подставятся в ведомость; сохраните её после
          проверки.
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
        <label for="control-import-file">Файл с результатами</label>
        <input
          id="control-import-file"
          ref="fileInput"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          :disabled="busy"
          @change="onFile"
        />
      </div>
      <p v-if="busy" role="status">Проверяем файл…</p>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>

      <template v-if="preview">
        <Message v-for="message in preview.fileErrors" :key="message" severity="error" role="alert">
          {{ message }}
        </Message>
        <p v-if="preview.rows.length > 0" role="status">
          Файл «{{ fileName }}»: распознано — <strong>{{ preview.validCount }}</strong
          >, с ошибками — <strong>{{ preview.invalidCount }}</strong
          >. Строки с ошибками не попадут в ведомость.
        </p>
        <div v-if="preview.rows.length > 0" class="import-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Строка</th>
                <th scope="col">Студент</th>
                <th scope="col">Результат</th>
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
                <td>{{ row.resolved ? resultText(row.resolved) : row.result || '—' }}</td>
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
          :label="`Заполнить ведомость: ${validRows.length}`"
          icon="pi pi-check"
          :disabled="validRows.length === 0"
          @click="apply"
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
