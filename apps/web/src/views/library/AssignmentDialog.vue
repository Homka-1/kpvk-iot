<script setup lang="ts">
import {
  ASSIGNMENT_ATTACHMENTS_MAX,
  ASSIGNMENT_CRITERIA_MAX,
  type AssignmentTypeDto,
  assignmentTypeFormSchema,
  DIFFICULTY_LEVEL_LABELS,
  DifficultyLevel,
  type FileDto,
  type LibraryAssignmentDto,
  libraryAssignmentFormSchema,
  SUBMISSION_FORMAT_LABELS,
  SubmissionFormat,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Textarea from 'primevue/textarea';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import { useContextStore } from '@/stores/context';
import { formatNumber } from '@/utils/format';
import FileUploadButton from './FileUploadButton.vue';
import { fileLabel } from './files';
import { issuesToErrors } from './form';

/**
 * Карточка задания библиотеки (п. 4.7, FR-046, FR-049): поля без конкретного назначения —
 * срок, этап ИОТ и статус задаются при назначении студенту.
 */
const props = defineProps<{
  assignment: LibraryAssignmentDto | null;
  types: AssignmentTypeDto[];
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: []; typeCreated: [type: AssignmentTypeDto] }>();
const context = useContextStore();

interface CriterionRow {
  title: string;
  description: string;
  maxScore: number | null;
}
interface AttachmentRow {
  title: string;
  file: FileDto | null;
  url: string;
}

const difficultyOptions = Object.values(DifficultyLevel).map((value) => ({
  value,
  label: DIFFICULTY_LEVEL_LABELS[value],
}));
const formats = Object.values(SubmissionFormat);
const form = reactive({
  title: '',
  disciplineId: null as string | null,
  topic: '',
  goal: '',
  difficulty: DifficultyLevel.BASIC as DifficultyLevel,
  typeId: null as string | null,
  instruction: '',
  submissionFormats: [SubmissionFormat.TEXT] as SubmissionFormat[],
  criteria: [] as CriterionRow[],
  attachments: [] as AttachmentRow[],
});
const errors = ref<Record<string, string>>({});
const serverError = ref<string | null>(null);
const saving = ref(false);
const newType = reactive({ open: false, name: '', error: null as string | null, busy: false });
let idempotencyKey = newIdempotencyKey();

const totalScore = computed(() =>
  form.criteria.reduce((sum, criterion) => sum + (criterion.maxScore ?? 0), 0),
);

watch(visible, (open) => {
  if (!open) return;
  const assignment = props.assignment;
  Object.assign(form, {
    title: assignment?.title ?? '',
    disciplineId: assignment?.discipline.id ?? context.disciplineId,
    topic: assignment?.topic ?? '',
    goal: assignment?.goal ?? '',
    difficulty: assignment?.difficulty ?? DifficultyLevel.BASIC,
    typeId: assignment?.type.id ?? null,
    instruction: assignment?.instruction ?? '',
    submissionFormats: assignment ? [...assignment.submissionFormats] : [SubmissionFormat.TEXT],
    criteria:
      assignment?.criteria.map((criterion) => ({
        title: criterion.title,
        description: criterion.description ?? '',
        maxScore: criterion.maxScore,
      })) ?? [],
    attachments:
      assignment?.attachments.map((attachment) => ({
        title: attachment.title ?? '',
        file: attachment.file,
        url: attachment.url ?? '',
      })) ?? [],
  });
  Object.assign(newType, { open: false, name: '', error: null });
  errors.value = {};
  serverError.value = null;
  idempotencyKey = newIdempotencyKey();
});

function addCriterion(): void {
  form.criteria.push({ title: '', description: '', maxScore: null });
}

function addLink(): void {
  form.attachments.push({ title: '', file: null, url: '' });
}

function addFile(file: FileDto): void {
  form.attachments.push({ title: '', file, url: '' });
}

async function createType(): Promise<void> {
  const parsed = assignmentTypeFormSchema.safeParse({ name: newType.name });
  newType.error = parsed.success ? null : parsed.error.issues[0]!.message;
  if (!parsed.success) return;
  newType.busy = true;
  try {
    const type = await api<AssignmentTypeDto>('/assignment-types', {
      method: 'POST',
      body: parsed.data,
      headers: { 'Idempotency-Key': newIdempotencyKey() },
    });
    emit('typeCreated', type);
    form.typeId = type.id;
    Object.assign(newType, { open: false, name: '' });
  } catch (error) {
    newType.error = error instanceof ApiError ? error.message : 'Не удалось добавить тип';
  } finally {
    newType.busy = false;
  }
}

async function save(): Promise<void> {
  serverError.value = null;
  const parsed = libraryAssignmentFormSchema.safeParse({
    ...form,
    criteria: form.criteria.map((criterion) => ({
      ...criterion,
      maxScore: criterion.maxScore ?? undefined,
    })),
    attachments: form.attachments.map((attachment) => ({
      title: attachment.title,
      fileId: attachment.file?.id ?? null,
      url: attachment.file ? null : attachment.url,
    })),
  });
  errors.value = parsed.success ? {} : issuesToErrors(parsed.error.issues);
  if (!parsed.success) return;
  saving.value = true;
  try {
    const assignment = props.assignment;
    await api(assignment ? `/library-assignments/${assignment.id}` : '/library-assignments', {
      method: assignment ? 'PUT' : 'POST',
      body: parsed.data,
      headers: assignment ? undefined : { 'Idempotency-Key': idempotencyKey },
    });
    emit('saved');
    visible.value = false;
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fields;
    serverError.value = error instanceof ApiError ? error.message : 'Не удалось сохранить задание';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="assignment ? 'Изменение задания' : 'Новое задание'"
    :style="{ width: '48rem' }"
    :breakpoints="{ '768px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <div class="iot-field">
        <label for="assignment-title">Название</label>
        <InputText id="assignment-title" v-model="form.title" :invalid="!!errors.title" fluid />
        <small v-if="errors.title" class="iot-field-error">{{ errors.title }}</small>
      </div>
      <div class="assignment-dialog__row">
        <div class="iot-field">
          <label id="assignment-discipline-label" for="assignment-discipline">Дисциплина</label>
          <Select
            v-model="form.disciplineId"
            input-id="assignment-discipline"
            aria-labelledby="assignment-discipline-label"
            :options="context.disciplines"
            option-label="name"
            option-value="id"
            placeholder="Выберите дисциплину"
            :invalid="!!errors.disciplineId"
            fluid
          />
          <small v-if="errors.disciplineId" class="iot-field-error">{{
            errors.disciplineId
          }}</small>
        </div>
        <div class="iot-field">
          <label for="assignment-topic">Тема (если есть)</label>
          <InputText id="assignment-topic" v-model="form.topic" :invalid="!!errors.topic" fluid />
          <small v-if="errors.topic" class="iot-field-error">{{ errors.topic }}</small>
        </div>
      </div>
      <div class="assignment-dialog__row">
        <div class="iot-field">
          <label id="assignment-type-label" for="assignment-type">Тип задания</label>
          <Select
            v-model="form.typeId"
            input-id="assignment-type"
            aria-labelledby="assignment-type-label"
            :options="types"
            option-label="name"
            option-value="id"
            placeholder="Выберите тип"
            :invalid="!!errors.typeId"
            fluid
          />
          <small v-if="errors.typeId" class="iot-field-error">{{ errors.typeId }}</small>
          <Button
            v-if="!newType.open"
            type="button"
            label="Добавить свой тип"
            icon="pi pi-plus"
            size="small"
            text
            class="assignment-dialog__inline"
            @click="newType.open = true"
          />
          <div v-else class="assignment-dialog__new-type">
            <InputText
              v-model="newType.name"
              aria-label="Название нового типа задания"
              placeholder="Например, эссе"
              :invalid="!!newType.error"
              fluid
            />
            <Button
              type="button"
              label="Добавить"
              size="small"
              :loading="newType.busy"
              @click="createType"
            />
            <Button
              type="button"
              icon="pi pi-times"
              size="small"
              severity="secondary"
              text
              aria-label="Отменить добавление типа"
              @click="newType.open = false"
            />
            <small v-if="newType.error" class="iot-field-error" role="alert">
              {{ newType.error }}
            </small>
          </div>
        </div>
        <div class="iot-field">
          <span id="assignment-difficulty-label" class="iot-field__label">Уровень сложности</span>
          <SelectButton
            v-model="form.difficulty"
            :options="difficultyOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            aria-labelledby="assignment-difficulty-label"
          />
          <small class="iot-field-hint"
            >Мотивационный профиль студента сложность не ограничивает.</small
          >
        </div>
      </div>
      <div class="iot-field">
        <label for="assignment-goal">Образовательная цель</label>
        <Textarea
          id="assignment-goal"
          v-model="form.goal"
          rows="2"
          :invalid="!!errors.goal"
          fluid
        />
        <small v-if="errors.goal" class="iot-field-error">{{ errors.goal }}</small>
      </div>
      <div class="iot-field">
        <label for="assignment-instruction">Инструкция</label>
        <Textarea
          id="assignment-instruction"
          v-model="form.instruction"
          rows="5"
          :invalid="!!errors.instruction"
          fluid
        />
        <small v-if="errors.instruction" class="iot-field-error">{{ errors.instruction }}</small>
      </div>

      <fieldset class="assignment-dialog__group">
        <legend>Формат сдачи</legend>
        <div class="assignment-dialog__checks">
          <div v-for="format in formats" :key="format" class="assignment-dialog__check">
            <Checkbox
              v-model="form.submissionFormats"
              :input-id="`assignment-format-${format}`"
              :value="format"
            />
            <label :for="`assignment-format-${format}`">{{
              SUBMISSION_FORMAT_LABELS[format]
            }}</label>
          </div>
        </div>
        <small v-if="errors.submissionFormats" class="iot-field-error">
          {{ errors.submissionFormats }}
        </small>
      </fieldset>

      <fieldset class="assignment-dialog__group">
        <legend>Критерии оценивания</legend>
        <p v-if="form.criteria.length === 0" class="iot-field-hint">
          Критериев нет — задание будет проверяться без баллов по критериям.
        </p>
        <div
          v-for="(criterion, index) in form.criteria"
          :key="index"
          class="assignment-dialog__item"
          data-testid="criterion-row"
        >
          <div class="assignment-dialog__criterion">
            <div class="iot-field">
              <label :for="`criterion-title-${index}`">Критерий {{ index + 1 }}</label>
              <InputText
                :id="`criterion-title-${index}`"
                v-model="criterion.title"
                :invalid="!!errors[`criteria.${index}.title`]"
                fluid
              />
              <small v-if="errors[`criteria.${index}.title`]" class="iot-field-error">
                {{ errors[`criteria.${index}.title`] }}
              </small>
            </div>
            <div class="iot-field assignment-dialog__score">
              <label :for="`criterion-score-${index}`">Макс. балл</label>
              <InputNumber
                v-model="criterion.maxScore"
                :input-id="`criterion-score-${index}`"
                :min-fraction-digits="0"
                :max-fraction-digits="3"
                locale="ru-RU"
                :invalid="!!errors[`criteria.${index}.maxScore`]"
                fluid
              />
              <small v-if="errors[`criteria.${index}.maxScore`]" class="iot-field-error">
                {{ errors[`criteria.${index}.maxScore`] }}
              </small>
            </div>
            <Button
              type="button"
              icon="pi pi-trash"
              severity="danger"
              text
              :aria-label="`Удалить критерий ${index + 1}`"
              class="assignment-dialog__remove"
              @click="form.criteria.splice(index, 1)"
            />
          </div>
          <Textarea
            v-model="criterion.description"
            rows="2"
            :aria-label="`Описание критерия ${index + 1}`"
            placeholder="Что проверяется (если нужно)"
            fluid
          />
        </div>
        <div class="assignment-dialog__footer">
          <Button
            v-if="form.criteria.length < ASSIGNMENT_CRITERIA_MAX"
            type="button"
            label="Добавить критерий"
            icon="pi pi-plus"
            size="small"
            text
            @click="addCriterion"
          />
          <span v-if="form.criteria.length > 0" class="iot-field-hint">
            Максимум за задание: {{ formatNumber(totalScore) }}
          </span>
        </div>
        <small v-if="errors.criteria" class="iot-field-error">{{ errors.criteria }}</small>
      </fieldset>

      <fieldset class="assignment-dialog__group">
        <legend>Ресурсы: файлы и ссылки</legend>
        <div
          v-for="(attachment, index) in form.attachments"
          :key="index"
          class="assignment-dialog__item assignment-dialog__attachment"
        >
          <div v-if="attachment.file" class="assignment-dialog__file">
            <i class="pi pi-file" aria-hidden="true" />
            {{ fileLabel(attachment.file) }}
          </div>
          <div v-else class="iot-field">
            <label :for="`attachment-url-${index}`">Ссылка</label>
            <InputText
              :id="`attachment-url-${index}`"
              v-model="attachment.url"
              type="url"
              placeholder="Адрес, начинается с https"
              :invalid="!!errors[`attachments.${index}.url`]"
              fluid
            />
            <small v-if="errors[`attachments.${index}.url`]" class="iot-field-error">
              {{ errors[`attachments.${index}.url`] }}
            </small>
          </div>
          <div class="assignment-dialog__criterion">
            <InputText
              v-model="attachment.title"
              :aria-label="`Подпись ресурса ${index + 1}`"
              placeholder="Подпись (если нужно)"
              fluid
            />
            <Button
              type="button"
              icon="pi pi-trash"
              severity="danger"
              text
              :aria-label="`Удалить ресурс ${index + 1}`"
              @click="form.attachments.splice(index, 1)"
            />
          </div>
          <small v-if="errors[`attachments.${index}.fileId`]" class="iot-field-error">
            {{ errors[`attachments.${index}.fileId`] }}
          </small>
        </div>
        <div
          v-if="form.attachments.length < ASSIGNMENT_ATTACHMENTS_MAX"
          class="assignment-dialog__footer"
        >
          <FileUploadButton label="Прикрепить файл" @uploaded="addFile" />
          <Button
            type="button"
            label="Добавить ссылку"
            icon="pi pi-link"
            size="small"
            text
            @click="addLink"
          />
        </div>
      </fieldset>

      <Message v-if="serverError" severity="error" role="alert">{{ serverError }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" :loading="saving" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.assignment-dialog__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--iot-space-3);
}

.assignment-dialog__inline {
  align-self: flex-start;
}

.assignment-dialog__new-type {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.assignment-dialog__new-type :deep(input) {
  flex: 1 1 10rem;
}

.assignment-dialog__group {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
  min-width: 0;
}

.assignment-dialog__group legend {
  padding: 0 var(--iot-space-1);
  color: var(--iot-color-heading);
  font-weight: 600;
}

.assignment-dialog__checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-4);
}

.assignment-dialog__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.assignment-dialog__item {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding-bottom: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
}

.assignment-dialog__criterion {
  display: flex;
  align-items: flex-end;
  gap: var(--iot-space-2);
}

.assignment-dialog__criterion > .iot-field:first-child,
.assignment-dialog__criterion > :deep(input) {
  flex: 1 1 auto;
}

.assignment-dialog__score {
  flex: 0 0 7.5rem;
}

.assignment-dialog__file {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
  margin: 0;
  overflow-wrap: anywhere;
}

.assignment-dialog__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}
</style>
