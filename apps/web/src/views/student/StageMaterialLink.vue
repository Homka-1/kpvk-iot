<script setup lang="ts">
import type { CabinetStageMaterialDto } from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { ref } from 'vue';
import { apiDownload, ApiError } from '@/api/http';
import { fileLabel } from '@/views/library/files';

/**
 * Материал этапа в кабинете студента (FR-037, FR-040): ссылка открывается в новой вкладке,
 * файл скачивается через API с проверкой прав, текст показывается в окне.
 */
const props = defineProps<{ material: CabinetStageMaterialDto }>();
const open = ref(false);
const error = ref<string | null>(null);

async function download(): Promise<void> {
  if (!props.material.file) return;
  error.value = null;
  try {
    await apiDownload(`/cabinet/files/${props.material.file.id}`);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось скачать файл';
  }
}
</script>

<template>
  <span class="stage-material">
    <a
      v-if="material.kind === 'LINK' && material.url"
      :href="material.url"
      target="_blank"
      rel="noopener noreferrer"
    >
      {{ material.title }} <i class="pi pi-external-link" aria-hidden="true" />
      <span class="iot-visually-hidden">(откроется в новой вкладке)</span>
    </a>
    <Button
      v-else-if="material.kind === 'FILE' && material.file"
      :label="material.title"
      icon="pi pi-download"
      link
      size="small"
      :aria-label="`Скачать: ${fileLabel(material.file)}`"
      @click="download"
    />
    <Button
      v-else
      :label="material.title"
      icon="pi pi-book"
      link
      size="small"
      aria-haspopup="dialog"
      @click="open = true"
    />
    <span v-if="material.description" class="stage-material__muted">
      {{ material.description }}
    </span>
    <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
    <Dialog
      v-model:visible="open"
      modal
      :header="material.title"
      :style="{ width: '40rem' }"
      :breakpoints="{ '640px': '95vw' }"
    >
      <p class="stage-material__body">{{ material.body || 'Текст материала не заполнен' }}</p>
    </Dialog>
  </span>
</template>

<style scoped>
.stage-material {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1) var(--iot-space-2);
  align-items: center;
}

.stage-material :deep(.p-button-link) {
  padding: 0;
  text-align: left;
}

.stage-material__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.stage-material__body {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
