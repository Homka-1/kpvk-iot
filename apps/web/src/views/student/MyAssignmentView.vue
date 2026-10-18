<script setup lang="ts">
import {
  type CabinetAssignmentDetailDto,
  DIFFICULTY_LEVEL_LABELS,
  type FileDto,
  formatFileSize,
  SUBMISSION_FORMAT_LABELS,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiDownload, api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime, formatNumber } from '@/utils/format';
import { assignmentBadge, dueText } from '@/views/assignments/status';

/**
 * Карточка задания в кабинете студента (п. 4.7; UC-04, шаги 4–5): цель, инструкция, критерии
 * оценивания, ресурсы, срок и формат сдачи. Отправка ответа — следующий этап (FR-050).
 */
const route = useRoute();
const id = computed(() => String(route.params.id));
const item = ref<CabinetAssignmentDetailDto | null>(null);
const error = ref<string | null>(null);
const downloadError = ref<string | null>(null);
const formats = computed(() =>
  item.value?.submissionFormats.map((value) => SUBMISSION_FORMAT_LABELS[value]).join(', '),
);

async function load(): Promise<void> {
  item.value = null;
  error.value = null;
  try {
    item.value = await api<CabinetAssignmentDetailDto>(`/cabinet/assignments/${id.value}`);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить задание';
  }
}

async function download(file: FileDto): Promise<void> {
  downloadError.value = null;
  try {
    await apiDownload(`/cabinet/files/${file.id}`);
  } catch (caught) {
    downloadError.value = caught instanceof ApiError ? caught.message : 'Не удалось скачать файл';
  }
}

watch(id, load, { immediate: true });
</script>

<template>
  <div class="iot-page my-assignment">
    <RouterLink :to="{ name: 'student-assignments' }" class="my-assignment__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> Мои задания
    </RouterLink>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!item" role="status">Загрузка…</p>
    <template v-else>
      <div class="my-assignment__heading">
        <h1>{{ item.assignment.title }}</h1>
        <StatusBadge v-bind="assignmentBadge(item.status)" />
      </div>

      <section class="iot-card" aria-labelledby="my-assignment-facts">
        <h2 id="my-assignment-facts" class="iot-visually-hidden">Сведения о задании</h2>
        <dl class="my-assignment__facts">
          <div>
            <dt>Дисциплина</dt>
            <dd>{{ item.discipline.name }}</dd>
          </div>
          <div>
            <dt>Тема</dt>
            <dd>{{ item.assignment.topic || 'Не указана' }}</dd>
          </div>
          <div>
            <dt>Этап ИОТ</dt>
            <dd>
              {{
                item.trajectory?.stage
                  ? `${item.trajectory.stage.sortOrder + 1}. ${item.trajectory.stage.title}`
                  : 'Вне маршрута'
              }}
            </dd>
          </div>
          <div>
            <dt>Тип и сложность</dt>
            <dd>
              {{ item.assignment.typeName }} ·
              {{ DIFFICULTY_LEVEL_LABELS[item.assignment.difficulty].toLowerCase() }}
            </dd>
          </div>
          <div>
            <dt>Срок</dt>
            <dd>{{ dueText(item.dueAt) }}</dd>
          </div>
          <div>
            <dt>Формат сдачи</dt>
            <dd>
              {{ formats }}
            </dd>
          </div>
          <div>
            <dt>Назначено</dt>
            <dd>
              {{ formatDateTime(item.assignedAt) }}
              <template v-if="item.assignedBy">· {{ item.assignedBy.fullName }}</template>
            </dd>
          </div>
        </dl>
      </section>

      <section class="iot-card" aria-labelledby="my-assignment-goal">
        <h2 id="my-assignment-goal" class="my-assignment__title">Цель</h2>
        <p class="my-assignment__text">{{ item.goal || 'Не указана' }}</p>
        <h2 class="my-assignment__title">Инструкция</h2>
        <p class="my-assignment__text">{{ item.instruction || 'Инструкция не добавлена' }}</p>
      </section>

      <section class="iot-card" aria-labelledby="my-assignment-criteria">
        <h2 id="my-assignment-criteria" class="my-assignment__title">Критерии оценивания</h2>
        <ul v-if="item.criteria.length" class="my-assignment__rows">
          <li v-for="criterion in item.criteria" :key="criterion.id">
            <strong>{{ criterion.title }}</strong> — до {{ formatNumber(criterion.maxScore) }} б.
            <span v-if="criterion.description" class="my-assignment__muted">
              {{ criterion.description }}
            </span>
          </li>
        </ul>
        <p v-else class="my-assignment__muted">Критерии не заданы</p>
        <p v-if="item.maxScore !== null" class="my-assignment__muted">
          Максимальный балл: {{ formatNumber(item.maxScore) }}
        </p>
      </section>

      <section class="iot-card" aria-labelledby="my-assignment-resources">
        <h2 id="my-assignment-resources" class="my-assignment__title">Ресурсы</h2>
        <ul v-if="item.attachments.length" class="my-assignment__rows">
          <li v-for="attachment in item.attachments" :key="attachment.id">
            <Button
              v-if="attachment.file"
              :label="attachment.title || attachment.file.originalName"
              icon="pi pi-download"
              link
              size="small"
              :aria-label="`Скачать: ${attachment.file.originalName} (${formatFileSize(attachment.file.sizeBytes)})`"
              @click="download(attachment.file)"
            />
            <a
              v-else-if="attachment.url"
              :href="attachment.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ attachment.title || attachment.url }}
              <i class="pi pi-external-link" aria-hidden="true" />
              <span class="iot-visually-hidden">(откроется в новой вкладке)</span>
            </a>
          </li>
        </ul>
        <p v-else class="my-assignment__muted">Файлов и ссылок нет</p>
        <Message v-if="downloadError" severity="error" role="alert">{{ downloadError }}</Message>
      </section>

      <Message severity="info" :closable="false">
        Отправка ответа на проверку появится в следующем обновлении системы. Пока выполните задание
        и сдайте его так, как договорились с преподавателем.
      </Message>
    </template>
  </div>
</template>

<style scoped>
.my-assignment {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.my-assignment__back {
  display: inline-flex;
  gap: var(--iot-space-1);
  align-items: center;
  align-self: flex-start;
}

.my-assignment__heading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.my-assignment__heading h1 {
  margin: 0;
  overflow-wrap: anywhere;
}

.my-assignment__title {
  margin: 0 0 var(--iot-space-1);
  font-size: 1rem;
}

.my-assignment__title:not(:first-child) {
  margin-top: var(--iot-space-3);
}

.my-assignment__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
}

.my-assignment__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.my-assignment__facts dd {
  margin: 0;
}

.my-assignment__text {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.my-assignment__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.my-assignment__rows {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding-left: var(--iot-space-4);
}

.my-assignment__rows :deep(.p-button-link) {
  padding: 0;
  text-align: left;
}
</style>
