<script setup lang="ts">
import { MATERIAL_KIND_LABELS, MaterialKind, type MaterialDto } from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useContextStore } from '@/stores/context';
import { formatDate } from '@/utils/format';
import { useAction, useList } from '@/views/disciplines/useList';
import { downloadFile, fileLabel } from './files';
import MaterialDialog from './MaterialDialog.vue';

/**
 * Служебный раздел «Библиотека материалов» (п. 3.1): файлы, ссылки и тексты по дисциплинам
 * и темам. Видны материалы своих дисциплин и общие (FR-002); материалы затем привязываются
 * к этапам ИОТ.
 */
const route = useRoute();
const context = useContextStore();
const KIND_ICONS: Record<MaterialKind, string> = {
  FILE: 'pi pi-file',
  LINK: 'pi pi-link',
  TEXT: 'pi pi-align-left',
};
const kindOptions = Object.values(MaterialKind).map((value) => ({
  value,
  label: MATERIAL_KIND_LABELS[value],
}));

const filters = reactive({
  q: '',
  disciplineId: context.disciplineId,
  topic: '',
  kind: null as MaterialKind | null,
  includeArchived: false,
});
const list = useList<MaterialDto>(
  () => '/materials',
  () => ({
    q: filters.q.trim() || null,
    disciplineId: filters.disciplineId,
    topic: filters.topic.trim() || null,
    kind: filters.kind,
    includeArchived: filters.includeArchived ? 'true' : null,
  }),
);
const filtered = computed(
  () => !!(filters.q.trim() || filters.disciplineId || filters.topic.trim() || filters.kind),
);
const action = useAction();
const downloadError = ref<string | null>(null);
const editorOpen = ref(false);
const archiveOpen = ref(false);
const selected = ref<MaterialDto | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => ({ ...filters }),
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => void list.load(), 300);
  },
);
onMounted(list.load);

function edit(material: MaterialDto | null): void {
  selected.value = material;
  editorOpen.value = true;
}

async function download(material: MaterialDto): Promise<void> {
  downloadError.value = null;
  try {
    await downloadFile(material.file!);
  } catch (error) {
    downloadError.value = error instanceof ApiError ? error.message : 'Не удалось скачать файл';
  }
}

async function archive(reason: string): Promise<void> {
  const target = selected.value;
  if (!target) return;
  if (
    await action.run(() =>
      api(`/materials/${target.id}/archive`, { method: 'POST', body: { reason } }),
    )
  ) {
    archiveOpen.value = false;
    void list.load();
  }
}

async function restore(material: MaterialDto): Promise<void> {
  if (await action.run(() => api(`/materials/${material.id}/restore`, { method: 'POST' }))) {
    void list.load();
  }
}

function placeLabel(material: MaterialDto): string {
  const discipline = material.discipline?.name ?? 'Общий материал';
  return material.topic ? `${discipline} · ${material.topic}` : discipline;
}

function resetFilters(): void {
  Object.assign(filters, { q: '', disciplineId: null, topic: '', kind: null });
}
</script>

<template>
  <div class="iot-page library">
    <div class="library__title">
      <h1>{{ route.meta.title }}</h1>
      <Button label="Добавить материал" icon="pi pi-plus" @click="edit(null)" />
    </div>

    <div class="library__toolbar">
      <IconField class="library__search">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filters.q"
          placeholder="Название, описание или тема"
          aria-label="Поиск материалов"
          fluid
        />
      </IconField>
      <Select
        v-model="filters.disciplineId"
        :options="context.disciplines"
        option-label="name"
        option-value="id"
        placeholder="Все дисциплины"
        show-clear
        aria-label="Фильтр по дисциплине"
        class="library__filter"
      />
      <InputText
        v-model="filters.topic"
        placeholder="Тема"
        aria-label="Фильтр по теме"
        class="library__filter"
      />
      <Select
        v-model="filters.kind"
        :options="kindOptions"
        option-label="label"
        option-value="value"
        placeholder="Любой вид"
        show-clear
        aria-label="Фильтр по виду материала"
        class="library__filter"
      />
      <div class="library__check">
        <Checkbox v-model="filters.includeArchived" input-id="materials-archived" binary />
        <label for="materials-archived">Показать архивные</label>
      </div>
    </div>
    <p v-if="action.error.value && !archiveOpen" class="iot-field-error" role="alert">
      {{ action.error.value }}
    </p>
    <p v-if="downloadError" class="iot-field-error" role="alert">{{ downloadError }}</p>

    <ErrorState v-if="list.error.value" :message="list.error.value" retryable @retry="list.load" />
    <p v-else-if="!list.loaded.value" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="list.items.value.length === 0 && filtered"
      icon="pi pi-search"
      title="Ничего не найдено"
      description="Измените условия поиска или сбросьте фильтры."
    >
      <Button label="Сбросить фильтры" severity="secondary" text @click="resetFilters" />
    </EmptyState>
    <EmptyState
      v-else-if="list.items.value.length === 0"
      icon="pi pi-folder-open"
      title="Материалов пока нет"
      description="Добавьте файлы, ссылки или тексты. Затем их можно будет привязать к этапам ИОТ."
    />
    <div v-else class="library__grid">
      <article
        v-for="material in list.items.value"
        :key="material.id"
        class="iot-card material"
        data-testid="material-card"
      >
        <header class="material__header">
          <StatusBadge
            :label="MATERIAL_KIND_LABELS[material.kind]"
            tone="info"
            :icon="KIND_ICONS[material.kind]"
          />
          <StatusBadge v-if="material.archivedAt" label="В архиве" icon="pi pi-box" />
        </header>
        <h2 class="material__name">{{ material.title }}</h2>
        <p class="material__muted">
          {{ placeLabel(material) }}
        </p>
        <p v-if="material.description" class="material__text">{{ material.description }}</p>

        <Button
          v-if="material.file"
          :label="`Скачать: ${fileLabel(material.file)}`"
          icon="pi pi-download"
          size="small"
          severity="secondary"
          outlined
          class="material__download"
          @click="download(material)"
        />
        <a
          v-else-if="material.url"
          :href="material.url"
          target="_blank"
          rel="noopener noreferrer"
          class="material__link"
        >
          <i class="pi pi-external-link" aria-hidden="true" />
          {{ material.url }}
        </a>
        <details v-else-if="material.body">
          <summary>Текст материала</summary>
          <p class="material__text material__body">{{ material.body }}</p>
        </details>

        <p class="material__muted">
          {{ material.createdBy?.fullName ?? 'Автор не указан' }} · изменён
          {{ formatDate(material.updatedAt) }}
        </p>
        <div class="iot-form-buttons">
          <Button
            v-if="material.archivedAt"
            label="Вернуть из архива"
            size="small"
            text
            @click="restore(material)"
          />
          <template v-else>
            <Button
              label="Изменить"
              icon="pi pi-pencil"
              size="small"
              text
              @click="edit(material)"
            />
            <Button
              label="В архив"
              icon="pi pi-box"
              size="small"
              severity="danger"
              text
              @click="
                selected = material;
                archiveOpen = true;
              "
            />
          </template>
        </div>
      </article>
    </div>

    <MaterialDialog v-model:visible="editorOpen" :material="selected" @saved="list.load" />
    <ActionDialog
      v-model:visible="archiveOpen"
      title="Архивирование материала"
      :message="`Материал «${selected?.title}» скроется из библиотеки. Там, где он уже используется, он сохранится.`"
      confirm-label="В архив"
      require-reason
      danger
      :busy="action.busy.value"
      :error="action.error.value"
      @confirm="archive"
    />
  </div>
</template>

<style scoped>
.library__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.library__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.library__search {
  flex: 1 1 260px;
}

.library__filter {
  flex: 0 1 200px;
  min-width: 0;
}

.library__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: var(--iot-space-3);
}

.material {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  min-width: 0;
}

.material p {
  margin: 0;
}

.material__header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.material__name {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.0625rem;
}

.material__muted {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}

.material__text {
  overflow-wrap: anywhere;
}

.material__body {
  padding-top: var(--iot-space-2);
  white-space: pre-line;
}

.material summary {
  cursor: pointer;
  color: var(--iot-color-heading);
  font-weight: 600;
}

.material__download {
  align-self: flex-start;
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: left;
}

.material__link {
  overflow-wrap: anywhere;
}
</style>
