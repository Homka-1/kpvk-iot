<script setup lang="ts">
import {
  ASSIGNMENT_SUBMITTABLE_STATUSES,
  type AssignmentWorkDto,
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
import SubmissionHistory from '@/views/assignments/SubmissionHistory.vue';
import AssignmentComments from '@/views/feedback/AssignmentComments.vue';
import { assignmentBadge, dueText, overdueBadge, scoreText } from '@/views/assignments/status';
import SubmissionForm from './SubmissionForm.vue';

/**
 * Карточка задания в кабинете студента (п. 4.7; UC-04): цель, инструкция, критерии оценивания,
 * ресурсы, срок и формат сдачи; выполнение — ответ на проверку (FR-050), повторная сдача после
 * доработки (FR-051), оценка и комментарий преподавателя (FR-052), история попыток.
 */
const route = useRoute();
const id = computed(() => String(route.params.id));
const item = ref<AssignmentWorkDto | null>(null);
const error = ref<string | null>(null);
const downloadError = ref<string | null>(null);
const starting = ref(false);
const actionError = ref<string | null>(null);
const canSubmit = computed(
  () => !!item.value && ASSIGNMENT_SUBMITTABLE_STATUSES.includes(item.value.status),
);
/** Последняя проверка — комментарий к возврату или итог принятого задания. */
const lastAssessment = computed(
  () =>
    [...(item.value?.submissions ?? [])].reverse().find((submission) => submission.assessment)
      ?.assessment ?? null,
);
const formats = computed(() =>
  item.value?.submissionFormats.map((value) => SUBMISSION_FORMAT_LABELS[value]).join(', '),
);

async function load(): Promise<void> {
  item.value = null;
  error.value = null;
  try {
    item.value = await api<AssignmentWorkDto>(`/cabinet/assignments/${id.value}`);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить задание';
  }
}

async function start(): Promise<void> {
  starting.value = true;
  actionError.value = null;
  try {
    item.value = await api<AssignmentWorkDto>(`/cabinet/assignments/${id.value}/start`, {
      method: 'POST',
    });
  } catch (caught) {
    actionError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось отметить начало работы';
  } finally {
    starting.value = false;
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
        <StatusBadge v-if="overdueBadge(item)" v-bind="overdueBadge(item)!" />
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

      <section class="iot-card my-assignment__work" aria-labelledby="my-assignment-work">
        <h2 id="my-assignment-work" class="my-assignment__title">Выполнение</h2>
        <Message v-if="item.status === 'SUBMITTED'" severity="info" :closable="false">
          Ответ отправлен и ждёт проверки преподавателем. Вы получите уведомление о результате.
        </Message>
        <Message v-else-if="item.status === 'COMPLETED'" severity="success" :closable="false">
          Задание выполнено<template v-if="lastAssessment && scoreText(lastAssessment)"
            >. Балл: {{ scoreText(lastAssessment) }}</template
          >.
        </Message>
        <Message v-else-if="item.status === 'RETURNED'" severity="warn" :closable="false">
          Задание возвращено на доработку. Учтите комментарий преподавателя и отправьте ответ снова.
          <template v-if="lastAssessment?.comment">
            <br />Комментарий: {{ lastAssessment.comment }}
          </template>
        </Message>
        <div v-if="item.status === 'ASSIGNED'" class="my-assignment__start">
          <p class="my-assignment__muted">
            Начали работу? Отметьте это — преподаватель увидит, что задание выполняется.
          </p>
          <Button
            label="Приступить к выполнению"
            icon="pi pi-play"
            severity="secondary"
            outlined
            :loading="starting"
            @click="start"
          />
        </div>
        <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>
        <SubmissionForm v-if="canSubmit" :work="item" @submitted="item = $event" />
      </section>

      <section class="iot-card" aria-labelledby="my-assignment-attempts">
        <h2 id="my-assignment-attempts" class="my-assignment__title">Мои попытки</h2>
        <SubmissionHistory
          :submissions="item.submissions"
          :file-path="(file) => `/cabinet/files/${file.id}`"
        />
      </section>

      <section class="iot-card">
        <AssignmentComments
          mode="student"
          :assignment-id="item.id"
          :assignment-title="item.assignment.title"
        />
      </section>
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

.my-assignment__work {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.my-assignment__work .my-assignment__title {
  margin: 0;
}

.my-assignment__start {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.my-assignment__rows :deep(.p-button-link) {
  padding: 0;
  text-align: left;
}
</style>
