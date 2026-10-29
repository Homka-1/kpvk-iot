<script setup lang="ts">
import {
  type AssignmentTypeDto,
  DIFFICULTY_LEVEL_LABELS,
  DifficultyLevel,
  type FileDto,
  type LibraryAssignmentDto,
  Permission,
  SUBMISSION_FORMAT_LABELS,
  type SubmissionFormat,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { formatNumber } from '@/utils/format';
import { useAction, useList } from '@/views/disciplines/useList';
import AssignmentDialog from '@/views/library/AssignmentDialog.vue';
import AssignTasksDialog from './AssignTasksDialog.vue';
import ReviewQueue from './ReviewQueue.vue';
import { downloadFile, fileLabel } from '@/views/library/files';

/**
 * Раздел «Задания»: библиотека заданий с поиском по дисциплине, теме и уровню сложности
 * (FR-046, FR-047, FR-049), назначение студентам, группе или на выбор (FR-048, FR-054)
 * и вкладка «На проверке» — ответы студентов, ожидающие проверки (AT-07).
 */
const route = useRoute();
const auth = useAuthStore();
const context = useContextStore();
const canLibrary = computed(() => auth.hasPermission(Permission.LIBRARY_MANAGE));
const canAssign = computed(
  () =>
    auth.hasPermission(Permission.ASSIGNMENTS_MANAGE) &&
    auth.hasPermission(Permission.STUDENTS_READ),
);
const tab = ref(route.query.tab === 'review' && canAssign.value ? 'review' : 'library');
const difficultyOptions = Object.values(DifficultyLevel).map((value) => ({
  value,
  label: DIFFICULTY_LEVEL_LABELS[value],
}));

const filters = reactive({
  q: '',
  disciplineId: context.disciplineId,
  topic: '',
  difficulty: null as DifficultyLevel | null,
  typeId: null as string | null,
  includeArchived: false,
});
const list = useList<LibraryAssignmentDto>(
  () => '/library-assignments',
  () => ({
    q: filters.q.trim() || null,
    disciplineId: filters.disciplineId,
    topic: filters.topic.trim() || null,
    difficulty: filters.difficulty,
    typeId: filters.typeId,
    includeArchived: filters.includeArchived ? 'true' : null,
  }),
);
const types = useList<AssignmentTypeDto>(() => '/assignment-types');
const filtered = computed(
  () =>
    !!(
      filters.q.trim() ||
      filters.disciplineId ||
      filters.topic.trim() ||
      filters.difficulty ||
      filters.typeId
    ),
);
const action = useAction();
const downloadError = ref<string | null>(null);
const editorOpen = ref(false);
const archiveOpen = ref(false);
const assignOpen = ref(false);
const selected = ref<LibraryAssignmentDto | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => ({ ...filters }),
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => void list.load(), 300);
  },
);
onMounted(() => {
  if (!canLibrary.value) return;
  void list.load();
  void types.load();
});

function edit(assignment: LibraryAssignmentDto | null): void {
  selected.value = assignment;
  editorOpen.value = true;
}

function onTypeCreated(type: AssignmentTypeDto): void {
  types.items.value = [...types.items.value, type];
}

async function download(file: FileDto): Promise<void> {
  downloadError.value = null;
  try {
    await downloadFile(file);
  } catch (error) {
    downloadError.value = error instanceof ApiError ? error.message : 'Не удалось скачать файл';
  }
}

async function archive(reason: string): Promise<void> {
  const target = selected.value;
  if (!target) return;
  if (
    await action.run(() =>
      api(`/library-assignments/${target.id}/archive`, { method: 'POST', body: { reason } }),
    )
  ) {
    archiveOpen.value = false;
    void list.load();
  }
}

async function restore(assignment: LibraryAssignmentDto): Promise<void> {
  if (
    await action.run(() => api(`/library-assignments/${assignment.id}/restore`, { method: 'POST' }))
  ) {
    void list.load();
  }
}

function placeLabel(discipline: string, topic: string | null): string {
  return topic ? `${discipline} · ${topic}` : discipline;
}

function formatsLabel(formats: SubmissionFormat[]): string {
  return formats.map((format) => SUBMISSION_FORMAT_LABELS[format]).join(', ');
}

function resetFilters(): void {
  Object.assign(filters, { q: '', disciplineId: null, topic: '', difficulty: null, typeId: null });
}
</script>

<template>
  <div class="iot-page tasks">
    <div class="tasks__title">
      <h1>{{ route.meta.title }}</h1>
      <Button v-if="canLibrary" label="Создать задание" icon="pi pi-plus" @click="edit(null)" />
    </div>

    <Tabs v-model:value="tab">
      <TabList>
        <Tab value="library">Библиотека заданий</Tab>
        <Tab v-if="canAssign" value="review">На проверке</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="library">
          <div class="tasks__panel">
            <EmptyState
              v-if="!canLibrary"
              icon="pi pi-lock"
              title="Нет доступа к библиотеке заданий"
              description="Для работы с библиотекой нужно разрешение «Библиотека материалов и заданий». Обратитесь к администратору."
            />
            <template v-else>
              <p class="tasks__info">
                <i class="pi pi-info-circle" aria-hidden="true" />
                Библиотека заданий. Срок, этап ИОТ и статус задаются при назначении задания студенту
                — из его индивидуальной траектории.
              </p>
              <div class="tasks__toolbar">
                <IconField class="tasks__search">
                  <InputIcon class="pi pi-search" />
                  <InputText
                    v-model="filters.q"
                    placeholder="Название, цель или тема"
                    aria-label="Поиск заданий"
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
                  class="tasks__filter"
                />
                <InputText
                  v-model="filters.topic"
                  placeholder="Тема"
                  aria-label="Фильтр по теме"
                  class="tasks__filter"
                />
                <Select
                  v-model="filters.difficulty"
                  :options="difficultyOptions"
                  option-label="label"
                  option-value="value"
                  placeholder="Любая сложность"
                  show-clear
                  aria-label="Фильтр по уровню сложности"
                  class="tasks__filter"
                />
                <Select
                  v-model="filters.typeId"
                  :options="types.items.value"
                  option-label="name"
                  option-value="id"
                  placeholder="Любой тип"
                  show-clear
                  aria-label="Фильтр по типу задания"
                  class="tasks__filter"
                />
                <div class="tasks__check">
                  <Checkbox v-model="filters.includeArchived" input-id="tasks-archived" binary />
                  <label for="tasks-archived">Показать архивные</label>
                </div>
              </div>
              <p v-if="action.error.value && !archiveOpen" class="iot-field-error" role="alert">
                {{ action.error.value }}
              </p>
              <p v-if="downloadError" class="iot-field-error" role="alert">{{ downloadError }}</p>

              <ErrorState
                v-if="list.error.value"
                :message="list.error.value"
                retryable
                @retry="list.load"
              />
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
                icon="pi pi-file-edit"
                title="Заданий пока нет"
                description="Создайте задание: цель, уровень сложности, инструкция, критерии оценивания и ресурсы."
              />
              <div v-else class="tasks__grid">
                <article
                  v-for="assignment in list.items.value"
                  :key="assignment.id"
                  class="iot-card task"
                  data-testid="assignment-card"
                >
                  <header class="task__header">
                    <StatusBadge :label="assignment.type.name" tone="info" icon="pi pi-tag" />
                    <StatusBadge
                      :label="`Сложность: ${DIFFICULTY_LEVEL_LABELS[assignment.difficulty]}`"
                      icon="pi pi-chart-bar"
                    />
                    <StatusBadge v-if="assignment.archivedAt" label="В архиве" icon="pi pi-box" />
                  </header>
                  <h2 class="task__name">{{ assignment.title }}</h2>
                  <p class="task__muted">
                    {{ placeLabel(assignment.discipline.name, assignment.topic) }}
                  </p>
                  <p v-if="assignment.goal"><strong>Цель:</strong> {{ assignment.goal }}</p>
                  <dl class="task__facts">
                    <dt>Формат сдачи</dt>
                    <dd>
                      {{ formatsLabel(assignment.submissionFormats) }}
                    </dd>
                    <dt>Критерии оценивания</dt>
                    <dd>
                      <template v-if="assignment.criteria.length > 0">
                        {{ assignment.criteria.map((criterion) => criterion.title).join('; ') }}
                        (максимум {{ formatNumber(assignment.maxScore ?? 0) }})
                      </template>
                      <template v-else>Не заданы</template>
                    </dd>
                  </dl>
                  <details v-if="assignment.instruction">
                    <summary>Инструкция</summary>
                    <p class="task__instruction">{{ assignment.instruction }}</p>
                  </details>
                  <ul v-if="assignment.attachments.length > 0" class="task__resources">
                    <li v-for="attachment in assignment.attachments" :key="attachment.id">
                      <Button
                        v-if="attachment.file"
                        :label="attachment.title ?? fileLabel(attachment.file)"
                        icon="pi pi-download"
                        size="small"
                        text
                        class="task__resource"
                        @click="download(attachment.file)"
                      />
                      <a
                        v-else-if="attachment.url"
                        :href="attachment.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="task__resource-link"
                      >
                        <i class="pi pi-external-link" aria-hidden="true" />
                        {{ attachment.title ?? attachment.url }}
                      </a>
                    </li>
                  </ul>
                  <p class="task__muted">
                    {{ assignment.createdBy?.fullName ?? 'Автор не указан' }}
                  </p>
                  <div class="iot-form-buttons">
                    <Button
                      v-if="assignment.archivedAt"
                      label="Вернуть из архива"
                      size="small"
                      text
                      @click="restore(assignment)"
                    />
                    <template v-else>
                      <Button
                        v-if="canAssign"
                        label="Назначить"
                        icon="pi pi-send"
                        size="small"
                        aria-haspopup="dialog"
                        @click="
                          selected = assignment;
                          assignOpen = true;
                        "
                      />
                      <Button
                        label="Изменить"
                        icon="pi pi-pencil"
                        size="small"
                        text
                        @click="edit(assignment)"
                      />
                      <Button
                        label="В архив"
                        icon="pi pi-box"
                        size="small"
                        severity="danger"
                        text
                        @click="
                          selected = assignment;
                          archiveOpen = true;
                        "
                      />
                    </template>
                  </div>
                </article>
              </div>

              <AssignmentDialog
                v-model:visible="editorOpen"
                :assignment="selected"
                :types="types.items.value"
                @saved="list.load"
                @type-created="onTypeCreated"
              />
              <AssignTasksDialog
                v-if="selected"
                v-model:visible="assignOpen"
                :assignment="selected"
              />
              <ActionDialog
                v-model:visible="archiveOpen"
                title="Архивирование задания"
                :message="`Задание «${selected?.title}» скроется из библиотеки. Уже назначенные студентам задания не изменятся.`"
                confirm-label="В архив"
                require-reason
                danger
                :busy="action.busy.value"
                :error="action.error.value"
                @confirm="archive"
              />
            </template>
          </div>
        </TabPanel>
        <TabPanel v-if="canAssign" value="review">
          <ReviewQueue />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.tasks__panel {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.tasks__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.tasks__info {
  display: flex;
  gap: var(--iot-space-2);
  margin: 0;
  padding: var(--iot-space-3) var(--iot-space-4);
  border: 1px solid var(--iot-color-info-border);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-info-text);
}

/* Сетка с равными колонками: поиск и чекбокс — на всю строку, фильтры одной ширины. */
.tasks__toolbar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  align-items: center;
  gap: var(--iot-space-2);
}

.tasks__search,
.tasks__check {
  grid-column: 1 / -1;
}

.tasks__filter {
  min-width: 0;
}

.tasks__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.tasks__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: var(--iot-space-3);
}

.task {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  min-width: 0;
}

.task p {
  margin: 0;
  overflow-wrap: anywhere;
}

.task__header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.task__name {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.0625rem;
}

.task__muted,
.task__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}

.task__facts {
  margin: 0;
}

.task__facts dd {
  margin: 0 0 var(--iot-space-2);
}

.task summary {
  cursor: pointer;
  color: var(--iot-color-heading);
  font-weight: 600;
}

.task__instruction {
  padding-top: var(--iot-space-2);
  white-space: pre-line;
}

.task__resources {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.task__resource {
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: left;
}

.task__resource-link {
  overflow-wrap: anywhere;
}
</style>
