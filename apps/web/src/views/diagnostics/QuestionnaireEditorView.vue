<script setup lang="ts">
import {
  DEMO_MARK,
  type DiagnosticDirectionDto,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  type QuestionnaireVersionDto,
  type QuestionnaireVersionInfoDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import Textarea from 'primevue/textarea';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import { versionBadge } from './content';
import PreviewDialog from './PreviewDialog.vue';
import QuestionsEditor from './QuestionsEditor.vue';
import RulesEditor from './RulesEditor.vue';
import ScalesEditor from './ScalesEditor.vue';

/**
 * Конструктор методики (п. 4.4 ТЗ, макет §5). Черновик редактируется целиком и сохраняется одной
 * кнопкой; опубликованная версия открывается только для чтения, изменение — через новую версию
 * (FR-026). Окончательные проверки выполняет сервер.
 */
const route = useRoute();
const router = useRouter();
const questionnaireId = computed(() => String(route.params.id));

const detail = ref<QuestionnaireDetailDto | null>(null);
const current = ref<QuestionnaireVersionDto | null>(null);
const content = ref<QuestionnaireContent | null>(null);
const snapshot = ref('');
const directions = ref<DiagnosticDirectionDto[]>([]);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const issues = ref<string[]>([]);
const notice = ref<string | null>(null);
const busy = ref(false);
const tab = ref('passport');
const previewOpen = ref(false);
const publishOpen = ref(false);
const newVersionOpen = ref(false);
const deleteOpen = ref(false);

const dirty = computed(
  () => content.value !== null && JSON.stringify(content.value) !== snapshot.value,
);
const archived = computed(() => detail.value?.status === 'ARCHIVED');
const readonly = computed(() => archived.value || current.value?.status !== 'DRAFT');
const draft = computed(() => detail.value?.versions.find((version) => version.status === 'DRAFT'));
const nextVersionNumber = computed(() => (detail.value?.versions[0]?.versionNumber ?? 0) + 1);

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

function defaultVersion(versions: QuestionnaireVersionInfoDto[]): string | undefined {
  return (
    versions.find((version) => version.status === 'DRAFT') ??
    versions.find((version) => version.status === 'PUBLISHED') ??
    versions[0]
  )?.id;
}

function show(version: QuestionnaireVersionDto): void {
  current.value = version;
  content.value = structuredClone(version.content);
  snapshot.value = JSON.stringify(version.content);
}

async function loadDetail(): Promise<void> {
  detail.value = await api<QuestionnaireDetailDto>(`/questionnaires/${questionnaireId.value}`);
}

async function loadVersion(): Promise<void> {
  if (!detail.value) return;
  const requested = typeof route.query.version === 'string' ? route.query.version : undefined;
  const versionId = detail.value.versions.some((version) => version.id === requested)
    ? requested
    : defaultVersion(detail.value.versions);
  if (!versionId) return;
  show(
    await api<QuestionnaireVersionDto>(
      `/questionnaires/${questionnaireId.value}/versions/${versionId}`,
    ),
  );
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    await loadDetail();
    await loadVersion();
  } catch (error) {
    loadError.value = message(error, 'Не удалось загрузить методику');
  }
}

onMounted(async () => {
  void load();
  directions.value = await api<DiagnosticDirectionDto[]>('/diagnostic-directions').catch(() => []);
});

watch(
  () => route.query.version,
  () => {
    if (detail.value && route.query.version !== current.value?.id) void load();
  },
);

/** Несохранённые изменения не теряются молча при уходе со страницы или смене версии. */
function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Есть несохранённые изменения. Уйти без сохранения?');
}
onBeforeRouteLeave((to) => to.name === 'questionnaire-editor' || confirmDiscard());
function beforeUnload(event: BeforeUnloadEvent): void {
  if (dirty.value) event.preventDefault();
}
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));

function openVersion(id: string): void {
  if (id === current.value?.id || !confirmDiscard()) return;
  snapshot.value = JSON.stringify(content.value);
  void router.replace({ query: { version: id } });
  tab.value = 'passport';
}

async function run(action: () => Promise<void>): Promise<boolean> {
  busy.value = true;
  actionError.value = null;
  notice.value = null;
  try {
    await action();
    return true;
  } catch (error) {
    actionError.value = message(error, 'Не удалось выполнить действие');
    if (error instanceof ApiError && error.status === 400) {
      issues.value = [...new Set(Object.values(error.fields))];
    }
    return false;
  } finally {
    busy.value = false;
  }
}

async function saveDraft(): Promise<void> {
  if (!current.value || !content.value) return;
  show(
    await api<QuestionnaireVersionDto>(
      `/questionnaires/${questionnaireId.value}/versions/${current.value.id}`,
      { method: 'PUT', body: content.value },
    ),
  );
  issues.value = [];
  await loadDetail();
}

async function save(): Promise<void> {
  if (await run(saveDraft)) notice.value = 'Черновик сохранён';
}

async function publish(): Promise<void> {
  const ok = await run(async () => {
    if (dirty.value) await saveDraft();
    show(
      await api<QuestionnaireVersionDto>(
        `/questionnaires/${questionnaireId.value}/versions/${current.value!.id}/publish`,
        { method: 'POST' },
      ),
    );
    issues.value = [];
    await loadDetail();
  });
  publishOpen.value = false;
  if (ok)
    notice.value = `Версия ${current.value?.versionNumber} опубликована и больше не изменяется`;
}

async function createVersion(): Promise<void> {
  const ok = await run(async () => {
    const created = await api<QuestionnaireVersionDto>(
      `/questionnaires/${questionnaireId.value}/versions`,
      { method: 'POST', body: {} },
    );
    await loadDetail();
    show(created);
    await router.replace({ query: { version: created.id } });
  });
  newVersionOpen.value = false;
  if (ok) notice.value = `Создан черновик версии ${current.value?.versionNumber}`;
}

async function deleteDraft(): Promise<void> {
  const ok = await run(async () => {
    await api(`/questionnaires/${questionnaireId.value}/versions/${current.value!.id}`, {
      method: 'DELETE',
    });
    snapshot.value = JSON.stringify(content.value);
    await loadDetail();
    await router.replace({ query: {} });
    await loadVersion();
  });
  deleteOpen.value = false;
  if (ok) notice.value = 'Черновик удалён';
}

async function changeDirection(directionId: string | null): Promise<void> {
  const ok = await run(async () => {
    detail.value = await api<QuestionnaireDetailDto>(`/questionnaires/${questionnaireId.value}`, {
      method: 'PATCH',
      body: { directionId },
    });
  });
  if (ok) notice.value = 'Направление изменено';
}
</script>

<template>
  <div class="iot-page editor">
    <RouterLink to="/diagnostics" class="editor__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> Диагностика
    </RouterLink>

    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="!detail || !current || !content" role="status">Загрузка…</p>
    <template v-else>
      <section class="iot-card editor__header" aria-labelledby="editor-title">
        <h1 id="editor-title" class="editor__title">{{ content.title || 'Без названия' }}</h1>
        <div class="editor__badges">
          <StatusBadge :label="`Версия ${current.versionNumber}`" tone="info" icon="pi pi-tag" />
          <StatusBadge v-bind="versionBadge(current.status)" />
          <StatusBadge v-if="detail.isDemo" :label="DEMO_MARK" tone="warning" icon="pi pi-flag" />
          <StatusBadge v-if="archived" label="Методика в архиве" tone="neutral" icon="pi pi-box" />
          <StatusBadge v-if="dirty" label="Есть несохранённые изменения" tone="warning" />
        </div>
        <div class="iot-form-buttons editor__actions">
          <template v-if="!readonly">
            <Button
              label="Сохранить"
              icon="pi pi-save"
              :disabled="!dirty"
              :loading="busy"
              @click="save"
            />
            <Button
              label="Опубликовать версию"
              icon="pi pi-check"
              severity="success"
              :disabled="busy"
              @click="publishOpen = true"
            />
          </template>
          <Button
            label="Предпросмотр"
            icon="pi pi-eye"
            severity="secondary"
            @click="previewOpen = true"
          />
          <template v-if="!archived">
            <Button
              v-if="readonly && !draft"
              label="Создать новую версию"
              icon="pi pi-plus"
              severity="secondary"
              :disabled="busy"
              @click="newVersionOpen = true"
            />
            <Button
              v-if="readonly && draft"
              :label="`Открыть черновик версии ${draft.versionNumber}`"
              icon="pi pi-pencil"
              severity="secondary"
              @click="openVersion(draft.id)"
            />
            <Button
              v-if="!readonly && current.versionNumber > 1"
              label="Удалить черновик"
              icon="pi pi-trash"
              severity="danger"
              text
              :disabled="busy"
              @click="deleteOpen = true"
            />
          </template>
        </div>
        <p v-if="notice" class="editor__notice" role="status">
          <i class="pi pi-check-circle" aria-hidden="true" /> {{ notice }}
        </p>
        <Message v-if="actionError" severity="error" :closable="false">
          {{ actionError }}
          <ul v-if="issues.length > 0" class="editor__issues">
            <li v-for="issue in issues" :key="issue">{{ issue }}</li>
          </ul>
        </Message>
        <Message v-if="readonly && !archived" severity="info" :closable="false">
          Опубликованная версия не изменяется. Чтобы изменить вопросы, ключи, шкалы или
          интерпретацию, создайте новую версию: прежние результаты не пересчитываются.
        </Message>
      </section>

      <Tabs v-model:value="tab" scrollable>
        <TabList>
          <Tab value="passport">Паспорт</Tab>
          <Tab value="questions">Вопросы ({{ content.questions.length }})</Tab>
          <Tab value="scales">Шкалы и ключи ({{ content.scales.length }})</Tab>
          <Tab value="rules">Интерпретация</Tab>
          <Tab value="versions">Версии ({{ detail.versions.length }})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="passport">
            <div class="iot-card iot-form editor__passport">
              <div class="iot-field">
                <label for="passport-title">Название</label>
                <InputText
                  id="passport-title"
                  v-model="content.title"
                  maxlength="300"
                  :disabled="readonly"
                  fluid
                />
              </div>
              <div class="editor__grid">
                <div class="iot-field">
                  <label for="passport-author">Автор</label>
                  <InputText
                    id="passport-author"
                    v-model="content.author"
                    maxlength="300"
                    :disabled="readonly"
                    fluid
                  />
                </div>
                <div class="iot-field">
                  <label for="passport-age">Возрастные ограничения</label>
                  <InputText
                    id="passport-age"
                    v-model="content.ageRestrictions"
                    maxlength="300"
                    :disabled="readonly"
                    fluid
                  />
                </div>
                <div class="iot-field">
                  <label for="passport-direction">Диагностическое направление</label>
                  <Select
                    :model-value="detail.direction?.id ?? null"
                    input-id="passport-direction"
                    :options="directions"
                    option-label="name"
                    option-value="id"
                    placeholder="Не указано"
                    show-clear
                    :disabled="archived || busy"
                    fluid
                    @update:model-value="changeDirection"
                  />
                  <small class="iot-field-hint"
                    >Относится ко всей методике и сохраняется сразу.</small
                  >
                </div>
              </div>
              <div class="iot-field">
                <label for="passport-purpose">Назначение</label>
                <Textarea
                  id="passport-purpose"
                  v-model="content.purpose"
                  rows="2"
                  maxlength="2000"
                  auto-resize
                  :disabled="readonly"
                  fluid
                />
              </div>
              <div class="iot-field">
                <label for="passport-instruction">Инструкция для студента</label>
                <Textarea
                  id="passport-instruction"
                  v-model="content.instruction"
                  rows="3"
                  maxlength="5000"
                  auto-resize
                  :disabled="readonly"
                  fluid
                />
              </div>
              <div class="iot-field">
                <label for="passport-source">Источник</label>
                <Textarea
                  id="passport-source"
                  v-model="content.source"
                  rows="2"
                  maxlength="1000"
                  auto-resize
                  :disabled="readonly"
                  fluid
                />
                <small v-if="detail.isDemo" class="iot-field-hint">
                  Название и источник демо-методики должны содержать «{{ DEMO_MARK }}».
                </small>
              </div>
              <div class="iot-field">
                <label for="passport-terms">Условия использования</label>
                <Textarea
                  id="passport-terms"
                  v-model="content.termsOfUse"
                  rows="2"
                  maxlength="2000"
                  auto-resize
                  :disabled="readonly"
                  fluid
                />
              </div>
              <div class="iot-field">
                <label for="passport-note">Что изменилось в этой версии</label>
                <Textarea
                  id="passport-note"
                  v-model="content.changeNote"
                  rows="2"
                  maxlength="1000"
                  auto-resize
                  :disabled="readonly"
                  fluid
                />
              </div>
              <div class="editor__check">
                <Checkbox
                  v-model="content.allowDraft"
                  input-id="passport-allow-draft"
                  binary
                  :disabled="readonly"
                />
                <label for="passport-allow-draft"
                  >Разрешить студенту сохранять черновик ответов</label
                >
              </div>
              <p v-if="detail.copiedFrom" class="iot-field-hint">
                Копия методики
                <RouterLink
                  :to="{ name: 'questionnaire-editor', params: { id: detail.copiedFrom.id } }"
                >
                  «{{ detail.copiedFrom.title }}»
                </RouterLink>
              </p>
            </div>
          </TabPanel>
          <TabPanel value="questions">
            <QuestionsEditor v-model:content="content" :readonly="readonly" />
          </TabPanel>
          <TabPanel value="scales">
            <ScalesEditor v-model:content="content" :readonly="readonly" />
          </TabPanel>
          <TabPanel value="rules">
            <RulesEditor v-model:content="content" :readonly="readonly" />
          </TabPanel>
          <TabPanel value="versions">
            <ol class="editor__versions">
              <li
                v-for="version in detail.versions"
                :key="version.id"
                class="iot-card editor__version"
                :aria-current="version.id === current.id ? 'true' : undefined"
              >
                <div class="editor__version-head">
                  <h2 class="editor__version-title">Версия {{ version.versionNumber }}</h2>
                  <StatusBadge v-bind="versionBadge(version.status)" />
                </div>
                <p>{{ version.title }}</p>
                <p v-if="version.changeNote" class="editor__muted">{{ version.changeNote }}</p>
                <p class="editor__muted">
                  Создана {{ formatDateTime(version.createdAt)
                  }}<template v-if="version.publishedAt">
                    · опубликована {{ formatDateTime(version.publishedAt) }}</template
                  >
                </p>
                <Button
                  v-if="version.id !== current.id"
                  label="Открыть"
                  size="small"
                  text
                  class="editor__version-open"
                  @click="openVersion(version.id)"
                />
                <p v-else class="editor__muted">Открыта сейчас</p>
              </li>
            </ol>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <PreviewDialog v-model:visible="previewOpen" :content="content" />
      <ActionDialog
        v-model:visible="publishOpen"
        title="Публикация версии"
        :message="`Версия ${current.versionNumber} станет действующей и больше не изменится. Предыдущая опубликованная версия будет выведена из использования; её результаты сохранятся без пересчёта.`"
        confirm-label="Опубликовать"
        :busy="busy"
        @confirm="publish"
      />
      <ActionDialog
        v-model:visible="newVersionOpen"
        title="Новая версия методики"
        :message="`Будет создана версия ${nextVersionNumber} — копия действующей. Прежние версии и результаты прохождений не изменятся и не пересчитываются.`"
        confirm-label="Создать версию"
        :busy="busy"
        @confirm="createVersion"
      />
      <ActionDialog
        v-model:visible="deleteOpen"
        title="Удаление черновика"
        :message="`Черновик версии ${current.versionNumber} будет удалён. Опубликованные версии не изменятся.`"
        confirm-label="Удалить"
        danger
        :busy="busy"
        @confirm="deleteDraft"
      />
    </template>
  </div>
</template>

<style scoped>
.editor {
  gap: var(--iot-space-4);
}

.editor__back {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-1);
  width: fit-content;
}

.editor__header {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.editor__title {
  margin: 0;
  overflow-wrap: anywhere;
}

.editor__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1);
}

.editor__actions {
  justify-content: flex-start;
}

.editor__notice {
  margin: 0;
  color: var(--iot-tone-success-text);
}

.editor__issues {
  margin: var(--iot-space-2) 0 0;
  padding-left: var(--iot-space-5);
}

.editor__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: var(--iot-space-3);
}

.editor__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.editor__versions {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.editor__version {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.editor__version[aria-current='true'] {
  border-color: var(--iot-color-focus);
}

.editor__version p {
  margin: 0;
}

.editor__version-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.editor__version-title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1rem;
}

.editor__version-open {
  align-self: flex-start;
}

.editor__muted {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}
</style>
