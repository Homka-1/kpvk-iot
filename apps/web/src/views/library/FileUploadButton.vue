<script setup lang="ts">
import { FILE_UPLOAD_HINT, type FileDto } from '@iot/shared';
import Button from 'primevue/button';
import { ref, useId } from 'vue';
import { ApiError } from '@/api/http';
import { FILE_ACCEPT, precheckFile, uploadFile } from './files';

/**
 * Выбор и загрузка одного файла. Файл сразу отправляется на сервер; родитель получает его
 * описание и сохраняет id в форме.
 */
withDefaults(defineProps<{ label?: string; invalid?: boolean }>(), {
  label: 'Выбрать файл',
  invalid: false,
});
const emit = defineEmits<{ uploaded: [file: FileDto] }>();

const input = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const hintId = useId();

async function onChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  error.value = precheckFile(file);
  if (error.value) return;
  busy.value = true;
  try {
    emit('uploaded', await uploadFile(file));
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить файл';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="file-upload">
    <input
      ref="input"
      type="file"
      class="file-upload__input"
      :accept="FILE_ACCEPT"
      tabindex="-1"
      aria-hidden="true"
      data-testid="file-input"
      @change="onChange"
    />
    <Button
      type="button"
      :label="label"
      icon="pi pi-upload"
      severity="secondary"
      outlined
      size="small"
      :loading="busy"
      :aria-describedby="hintId"
      :class="{ 'p-invalid': invalid }"
      @click="input?.click()"
    />
    <small :id="hintId" class="file-upload__hint">{{ FILE_UPLOAD_HINT }}</small>
    <small v-if="error" class="iot-field-error" role="alert">{{ error }}</small>
  </div>
</template>

<style scoped>
.file-upload {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-1);
}

.file-upload__input {
  display: none;
}

.file-upload__hint {
  color: var(--iot-color-muted);
}
</style>
