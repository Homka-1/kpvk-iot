<script setup lang="ts">
import {
  type AssignmentWorkDto,
  type FileDto,
  formatFileSize,
  SUBMISSION_FILES_MAX,
  SUBMISSION_TEXT_MAX,
  SubmissionFormat,
  submissionIssues,
} from '@iot/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { computed, reactive, ref } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import FileUploadButton from '@/views/library/FileUploadButton.vue';

/**
 * Ответ на задание (FR-050, UC-04): текст, файлы, ссылка — в форматах, которые допускает
 * задание. «Отправить на проверку» создаёт новую попытку; повтор формы дублей не создаёт.
 */
const props = defineProps<{ work: AssignmentWorkDto }>();
const emit = defineEmits<{ submitted: [work: AssignmentWorkDto] }>();

const allows = (format: SubmissionFormat) =>
  props.work.submissionFormats.length === 0 || props.work.submissionFormats.includes(format);
const text = ref('');
const url = ref('');
const files = ref<FileDto[]>([]);
const errors = reactive<Record<string, string | null>>({ text: null, url: null, fileIds: null });
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

const canAddFile = computed(() => files.value.length < SUBMISSION_FILES_MAX);

function addFile(file: FileDto): void {
  files.value.push(file);
  errors.fileIds = null;
}

function removeFile(id: string): void {
  files.value = files.value.filter((file) => file.id !== id);
}

async function send(): Promise<void> {
  const answer = {
    text: text.value.trim() || null,
    url: url.value.trim() || null,
    fileIds: files.value.map((file) => file.id),
  };
  Object.assign(errors, { text: null, url: null, fileIds: null });
  error.value = null;
  const issues = submissionIssues(props.work.submissionFormats, answer);
  for (const issue of issues) errors[issue.field] = issue.message;
  if (issues.length) return;
  busy.value = true;
  try {
    const work = await api<AssignmentWorkDto>(`/cabinet/assignments/${props.work.id}/submissions`, {
      method: 'POST',
      body: answer,
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    idempotencyKey = newIdempotencyKey();
    text.value = '';
    url.value = '';
    files.value = [];
    emit('submitted', work);
  } catch (caught) {
    if (caught instanceof ApiError) {
      error.value = caught.message;
      for (const field of Object.keys(errors)) errors[field] = caught.fields[field] ?? null;
    } else {
      error.value = 'Не удалось отправить ответ';
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="submission-form" novalidate @submit.prevent="send">
    <div v-if="allows(SubmissionFormat.TEXT)" class="submission-form__field">
      <label for="submission-text">Ответ текстом</label>
      <Textarea
        id="submission-text"
        v-model="text"
        rows="5"
        :maxlength="SUBMISSION_TEXT_MAX"
        :invalid="!!errors.text"
        aria-describedby="submission-text-error"
      />
      <small v-if="errors.text" id="submission-text-error" class="iot-field-error">
        {{ errors.text }}
      </small>
    </div>

    <div v-if="allows(SubmissionFormat.FILE)" class="submission-form__field">
      <span id="submission-files-label">Файлы (не больше {{ SUBMISSION_FILES_MAX }})</span>
      <ul
        v-if="files.length"
        class="submission-form__files"
        aria-labelledby="submission-files-label"
      >
        <li v-for="file in files" :key="file.id">
          {{ file.originalName }}
          <span class="submission-form__muted">({{ formatFileSize(file.sizeBytes) }})</span>
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="`Убрать файл ${file.originalName}`"
            @click="removeFile(file.id)"
          />
        </li>
      </ul>
      <FileUploadButton
        endpoint="/cabinet/files"
        label="Прикрепить файл"
        :disabled="!canAddFile"
        :invalid="!!errors.fileIds"
        @uploaded="addFile"
      />
      <small v-if="errors.fileIds" class="iot-field-error">{{ errors.fileIds }}</small>
    </div>

    <div v-if="allows(SubmissionFormat.LINK)" class="submission-form__field">
      <label for="submission-url">Ссылка на работу</label>
      <InputText
        id="submission-url"
        v-model="url"
        type="url"
        inputmode="url"
        placeholder="https://"
        :invalid="!!errors.url"
        aria-describedby="submission-url-error"
      />
      <small v-if="errors.url" id="submission-url-error" class="iot-field-error">
        {{ errors.url }}
      </small>
    </div>

    <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
    <div class="submission-form__actions">
      <Button type="submit" label="Отправить на проверку" icon="pi pi-send" :loading="busy" />
    </div>
  </form>
</template>

<style scoped>
.submission-form {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.submission-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.submission-form__files {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding-left: var(--iot-space-4);
  overflow-wrap: anywhere;
}

.submission-form__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.submission-form__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
