<script setup lang="ts">
import { type FileDto, formatFileSize, type SubmissionDto } from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { ref } from 'vue';
import { apiDownload, ApiError } from '@/api/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime, formatNumber } from '@/utils/format';
import { decisionBadge, scoreText } from './status';

/**
 * История попыток сдачи задания (FR-051): ответ (текст, ссылка, файлы), отметка о сдаче после
 * срока и проверка — решение, баллы по критериям, комментарий преподавателя (FR-052).
 * Новые попытки — сверху.
 */
const props = defineProps<{
  submissions: SubmissionDto[];
  /** Путь скачивания файла ответа: у студента — кабинет, у преподавателя — раздел заданий. */
  filePath: (file: FileDto) => string;
}>();

const downloadError = ref<string | null>(null);

async function download(file: FileDto): Promise<void> {
  downloadError.value = null;
  try {
    await apiDownload(props.filePath(file));
  } catch (caught) {
    downloadError.value = caught instanceof ApiError ? caught.message : 'Не удалось скачать файл';
  }
}
</script>

<template>
  <p v-if="submissions.length === 0" class="history__muted">Ответ ещё не отправлялся</p>
  <ol v-else class="history" aria-label="Попытки сдачи">
    <li v-for="submission in [...submissions].reverse()" :key="submission.id" class="history__item">
      <div class="history__head">
        <strong>Попытка {{ submission.attemptNumber }}</strong>
        <span class="history__muted">{{ formatDateTime(submission.submittedAt) }}</span>
        <StatusBadge
          v-if="submission.late"
          label="Отправлено после срока"
          tone="warning"
          icon="pi pi-clock"
        />
      </div>
      <p v-if="submission.text" class="history__text">{{ submission.text }}</p>
      <a
        v-if="submission.url"
        :href="submission.url"
        target="_blank"
        rel="noopener noreferrer"
        class="history__link"
      >
        {{ submission.url }}
        <i class="pi pi-external-link" aria-hidden="true" />
        <span class="iot-visually-hidden">(откроется в новой вкладке)</span>
      </a>
      <ul v-if="submission.files.length" class="history__files">
        <li v-for="file in submission.files" :key="file.id">
          <Button
            :label="file.originalName"
            icon="pi pi-download"
            link
            size="small"
            :aria-label="`Скачать: ${file.originalName} (${formatFileSize(file.sizeBytes)})`"
            @click="download(file)"
          />
        </li>
      </ul>

      <div v-if="submission.assessment" class="history__assessment">
        <div class="history__head">
          <StatusBadge v-bind="decisionBadge(submission.assessment.decision)" />
          <span v-if="scoreText(submission.assessment)">
            Балл: <strong>{{ scoreText(submission.assessment) }}</strong>
          </span>
          <span class="history__muted">
            {{ submission.assessment.assessor?.fullName ?? 'Преподаватель' }} ·
            {{ formatDateTime(submission.assessment.createdAt) }}
          </span>
        </div>
        <ul v-if="submission.assessment.criterionScores.length" class="history__criteria">
          <li v-for="item in submission.assessment.criterionScores" :key="item.criterionId">
            {{ item.title }}: {{ formatNumber(item.score) }} из {{ formatNumber(item.maxScore) }}
            <span v-if="item.comment" class="history__muted">— {{ item.comment }}</span>
          </li>
        </ul>
        <p v-if="submission.assessment.comment" class="history__text">
          <span class="history__muted">Комментарий преподавателя:</span>
          {{ submission.assessment.comment }}
        </p>
      </div>
      <p v-else class="history__muted">
        <i class="pi pi-hourglass" aria-hidden="true" /> Ждёт проверки
      </p>
    </li>
  </ol>
  <Message v-if="downloadError" severity="error" role="alert">{{ downloadError }}</Message>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.history__item {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding-bottom: var(--iot-space-3);
  border-bottom: 1px solid var(--iot-color-border);
}

.history__item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.history__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1) var(--iot-space-2);
  align-items: center;
}

.history__text {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.history__link {
  overflow-wrap: anywhere;
}

.history__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.history__files,
.history__criteria {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding-left: var(--iot-space-4);
}

.history__files :deep(.p-button-link) {
  padding: 0;
  text-align: left;
}

.history__assessment {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding: var(--iot-space-2) var(--iot-space-3);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
}
</style>
