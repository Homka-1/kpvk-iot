<script setup lang="ts">
import {
  ASSESSMENT_COMMENT_MAX,
  type AssessmentDecision,
  type AssignmentReviewDto,
  checkAssessment,
  DIFFICULTY_LEVEL_LABELS,
  type FileDto,
  formatFileSize,
  SUBMISSION_FORMAT_LABELS,
} from '@iot/shared';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Textarea from 'primevue/textarea';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, apiDownload, ApiError, newIdempotencyKey } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime, formatNumber } from '@/utils/format';
import SubmissionHistory from './SubmissionHistory.vue';
import { assignmentBadge, dueText, overdueBadge } from './status';

/**
 * Проверка ответа (AT-07; FR-051, FR-052): сведения о задании и студенте, критерии, история
 * попыток. Последнюю отправленную попытку преподаватель принимает с баллами по каждому критерию
 * или возвращает на доработку с комментарием для студента. Решение — за преподавателем.
 */
const route = useRoute();
const id = computed(() => String(route.params.id));
const item = ref<AssignmentReviewDto | null>(null);
const error = ref<string | null>(null);
const downloadError = ref<string | null>(null);

const decision = ref<AssessmentDecision>('ACCEPTED');
const comment = ref('');
const scores = reactive<Record<string, number | null>>({});
const notes = reactive<Record<string, string>>({});
const errors = ref<Record<string, string>>({});
const formError = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

/** Попытка, ожидающая проверки: последняя, без решения, при статусе «На проверке». */
const pending = computed(() => {
  const last = item.value?.submissions.at(-1);
  return item.value?.status === 'SUBMITTED' && last && !last.assessment ? last : null;
});
const formats = computed(() =>
  item.value?.submissionFormats.map((value) => SUBMISSION_FORMAT_LABELS[value]).join(', '),
);
const accepted = computed(() => decision.value === 'ACCEPTED');
const total = computed(() => {
  const criteria = item.value?.criteria ?? [];
  if (!criteria.length || criteria.some((criterion) => scores[criterion.id] == null)) return null;
  return criteria.reduce((sum, criterion) => sum + scores[criterion.id]!, 0);
});

function resetForm(): void {
  decision.value = 'ACCEPTED';
  comment.value = '';
  for (const key of Object.keys(scores)) delete scores[key];
  for (const key of Object.keys(notes)) delete notes[key];
  for (const criterion of item.value?.criteria ?? []) scores[criterion.id] = null;
  errors.value = {};
  formError.value = null;
  idempotencyKey = newIdempotencyKey();
}

async function load(): Promise<void> {
  item.value = null;
  error.value = null;
  try {
    item.value = await api<AssignmentReviewDto>(`/student-assignments/${id.value}`);
    resetForm();
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить задание';
  }
}

async function download(file: FileDto): Promise<void> {
  downloadError.value = null;
  try {
    await apiDownload(`/files/${file.id}`);
  } catch (caught) {
    downloadError.value = caught instanceof ApiError ? caught.message : 'Не удалось скачать файл';
  }
}

async function save(): Promise<void> {
  const target = item.value;
  const submission = pending.value;
  if (!target || !submission) return;
  const criterionScores = accepted.value
    ? target.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: scores[criterion.id] ?? Number.NaN,
        comment: notes[criterion.id]?.trim() || null,
      }))
    : [];
  const body = {
    submissionId: submission.id,
    decision: decision.value,
    comment: comment.value.trim() || null,
    criterionScores,
  };
  const check = checkAssessment(target.criteria, body);
  errors.value = Object.fromEntries(check.issues.map((issue) => [issue.field, issue.message]));
  formError.value = null;
  if (check.issues.length) return;
  busy.value = true;
  try {
    item.value = await api<AssignmentReviewDto>(`/student-assignments/${target.id}/assessments`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    resetForm();
  } catch (caught) {
    if (caught instanceof ApiError) {
      formError.value = caught.message;
      errors.value = caught.fields;
    } else {
      formError.value = 'Не удалось сохранить проверку';
    }
  } finally {
    busy.value = false;
  }
}

watch(id, load, { immediate: true });
</script>

<template>
  <div class="iot-page review">
    <RouterLink :to="{ name: 'assignments', query: { tab: 'review' } }" class="review__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> Задания
    </RouterLink>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!item" role="status">Загрузка…</p>
    <template v-else>
      <div class="review__heading">
        <h1>{{ item.assignment.title }}</h1>
        <StatusBadge v-bind="assignmentBadge(item.status)" />
        <StatusBadge v-if="overdueBadge(item)" v-bind="overdueBadge(item)!" />
      </div>

      <section class="iot-card" aria-labelledby="review-facts">
        <h2 id="review-facts" class="iot-visually-hidden">Сведения о задании</h2>
        <dl class="review__facts">
          <div>
            <dt>Студент</dt>
            <dd>
              <RouterLink
                :to="{
                  name: 'student-details',
                  params: { id: item.student.id },
                  query: { tab: 'assignments' },
                }"
              >
                {{ item.student.fullName }}
              </RouterLink>
              <template v-if="item.student.group"> · {{ item.student.group.name }}</template>
            </dd>
          </div>
          <div>
            <dt>Дисциплина</dt>
            <dd>{{ item.discipline.name }}</dd>
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
          <div v-if="item.completedAt">
            <dt>Выполнено</dt>
            <dd>{{ formatDateTime(item.completedAt) }}</dd>
          </div>
        </dl>
      </section>

      <section class="iot-card" aria-labelledby="review-task">
        <h2 id="review-task" class="review__title">Инструкция и критерии</h2>
        <p class="review__text">{{ item.instruction || 'Инструкция не добавлена' }}</p>
        <ul v-if="item.criteria.length" class="review__rows">
          <li v-for="criterion in item.criteria" :key="criterion.id">
            <strong>{{ criterion.title }}</strong> — до {{ formatNumber(criterion.maxScore) }} б.
            <span v-if="criterion.description" class="review__muted">
              {{ criterion.description }}
            </span>
          </li>
        </ul>
        <p v-else class="review__muted">Критерии не заданы — задание принимается без балла.</p>
        <ul v-if="item.attachments.length" class="review__rows">
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
        <Message v-if="downloadError" severity="error" role="alert">{{ downloadError }}</Message>
      </section>

      <section class="iot-card" aria-labelledby="review-attempts">
        <h2 id="review-attempts" class="review__title">Ответы студента</h2>
        <SubmissionHistory
          :submissions="item.submissions"
          :file-path="(file) => `/student-assignments/files/${file.id}`"
        />
      </section>

      <section v-if="pending" class="iot-card" aria-labelledby="review-form">
        <h2 id="review-form" class="review__title">Проверка попытки {{ pending.attemptNumber }}</h2>
        <form class="review__form" novalidate @submit.prevent="save">
          <fieldset class="review__decision">
            <legend>Решение</legend>
            <div class="review__option">
              <RadioButton
                v-model="decision"
                input-id="review-accept"
                name="review-decision"
                value="ACCEPTED"
              />
              <label for="review-accept">Принять задание</label>
            </div>
            <div class="review__option">
              <RadioButton
                v-model="decision"
                input-id="review-return"
                name="review-decision"
                value="RETURNED"
              />
              <label for="review-return">Вернуть на доработку</label>
            </div>
          </fieldset>

          <div v-if="accepted && item.criteria.length" class="review__scores">
            <div
              v-for="(criterion, index) in item.criteria"
              :key="criterion.id"
              class="review__score"
            >
              <label :for="`review-score-${index}`">
                {{ criterion.title }} (0–{{ formatNumber(criterion.maxScore) }})
              </label>
              <InputNumber
                v-model="scores[criterion.id]"
                :input-id="`review-score-${index}`"
                :min="0"
                :max="criterion.maxScore"
                :min-fraction-digits="0"
                :max-fraction-digits="3"
                :use-grouping="false"
                locale="ru-RU"
                :invalid="!!errors[`criterionScores.${index}`]"
                :aria-describedby="`review-score-${index}-error`"
                fluid
              />
              <InputText
                v-model="notes[criterion.id]"
                :aria-label="`Пояснение по критерию «${criterion.title}» (необязательно)`"
                placeholder="Пояснение (необязательно)"
                :maxlength="ASSESSMENT_COMMENT_MAX"
                fluid
              />
              <small
                v-if="errors[`criterionScores.${index}`]"
                :id="`review-score-${index}-error`"
                class="iot-field-error"
              >
                {{ errors[`criterionScores.${index}`] }}
              </small>
            </div>
            <p class="review__total">
              Итого:
              <strong>
                {{ total === null ? 'поставьте баллы по всем критериям' : formatNumber(total) }}
              </strong>
              из {{ formatNumber(item.maxScore ?? 0) }}
            </p>
            <small v-if="errors.criterionScores" class="iot-field-error">
              {{ errors.criterionScores }}
            </small>
          </div>

          <div class="review__field">
            <label for="review-comment">
              Комментарий для студента{{ accepted ? ' (необязательно)' : '' }}
            </label>
            <Textarea
              id="review-comment"
              v-model="comment"
              rows="4"
              :maxlength="ASSESSMENT_COMMENT_MAX"
              :invalid="!!errors.comment"
              aria-describedby="review-comment-error"
            />
            <small v-if="errors.comment" id="review-comment-error" class="iot-field-error">
              {{ errors.comment }}
            </small>
          </div>

          <Message v-if="formError" severity="error" role="alert">{{ formError }}</Message>
          <div class="review__actions">
            <Button
              type="submit"
              :label="accepted ? 'Принять' : 'Вернуть на доработку'"
              :icon="accepted ? 'pi pi-check' : 'pi pi-replay'"
              :loading="busy"
            />
          </div>
        </form>
      </section>
      <Message v-else-if="item.status === 'SUBMITTED'" severity="info" :closable="false">
        Попытка уже проверена. Обновите страницу.
      </Message>
    </template>
  </div>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.review__back {
  display: inline-flex;
  gap: var(--iot-space-1);
  align-items: center;
  align-self: flex-start;
}

.review__heading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.review__heading h1 {
  margin: 0;
  overflow-wrap: anywhere;
}

.review__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1rem;
}

.review__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
}

.review__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.review__facts dd {
  margin: 0;
}

.review__text {
  margin: 0 0 var(--iot-space-2);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.review__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.review__rows {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0 0 var(--iot-space-2);
  padding-left: var(--iot-space-4);
}

.review__rows :deep(.p-button-link) {
  padding: 0;
  text-align: left;
}

.review__form,
.review__scores,
.review__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.review__field,
.review__score {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.review__scores {
  max-width: 480px;
}

.review__decision {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
  padding: 0;
  border: none;
}

.review__decision legend {
  width: 100%;
  margin-bottom: var(--iot-space-1);
  padding: 0;
}

.review__option {
  display: flex;
  gap: var(--iot-space-2);
  align-items: center;
}

.review__total {
  margin: 0;
}

.review__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
