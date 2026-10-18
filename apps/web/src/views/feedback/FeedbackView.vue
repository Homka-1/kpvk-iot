<script setup lang="ts">
import {
  CONSULTATION_STATUS_LABELS,
  type ConsultationDto,
  ConsultationStatus,
  type FeedbackDto,
  formatFullName,
  type StudentPageDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useContextStore } from '@/stores/context';
import ConsultationActions from './ConsultationActions.vue';
import ConsultationCard from './ConsultationCard.vue';
import ConsultationDialog from './ConsultationDialog.vue';
import type { StudentOption } from './content';
import FeedbackComposeDialog from './FeedbackComposeDialog.vue';
import FeedbackThread from './FeedbackThread.vue';

/**
 * Раздел «Обратная связь» преподавателя (п. 4.9): обращения студентов (вопросы, затруднения,
 * предложения изменить маршрут), консультации (FR-067) и сообщения студентам. Группа
 * и дисциплина — из шапки; данные только по своим студентам (FR-002, проверяет сервер).
 */
const route = useRoute();
const router = useRouter();
const context = useContextStore();

const TABS = ['requests', 'consultations', 'messages'] as const;
type TabValue = (typeof TABS)[number];
const initialTab = (): TabValue => {
  const value = String(route.query.tab ?? '');
  return (TABS as readonly string[]).includes(value) ? (value as TabValue) : 'requests';
};
const tab = ref<TabValue>(initialTab());
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value } });
});
watch(
  () => route.query.tab,
  () => {
    tab.value = initialTab();
  },
);

const openOnly = ref(true);
const openOptions = [
  { value: true, label: 'Ждут ответа' },
  { value: false, label: 'Все обращения' },
];
const status = ref<ConsultationStatus | null>(null);
const statusOptions = Object.values(ConsultationStatus).map((value) => ({
  value,
  label: CONSULTATION_STATUS_LABELS[value],
}));

const requests = ref<FeedbackDto[] | null>(null);
const messages = ref<FeedbackDto[] | null>(null);
const consultations = ref<ConsultationDto[] | null>(null);
const errors = ref<Record<TabValue, string | null>>({
  requests: null,
  consultations: null,
  messages: null,
});
const students = ref<StudentOption[]>([]);
const composeOpen = ref(false);
const consultationOpen = ref(false);
const actions = ref<InstanceType<typeof ConsultationActions>>();

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;
const contextQuery = () => ({ groupId: context.groupId, disciplineId: context.disciplineId });

async function loadRequests(): Promise<void> {
  errors.value.requests = null;
  try {
    requests.value = await api<FeedbackDto[]>('/feedback', {
      query: { ...contextQuery(), source: 'student', open: openOnly.value ? 'true' : undefined },
    });
  } catch (error) {
    errors.value.requests = message(error, 'Не удалось загрузить обращения студентов');
  }
}

async function loadMessages(): Promise<void> {
  errors.value.messages = null;
  try {
    messages.value = await api<FeedbackDto[]>('/feedback', {
      query: { ...contextQuery(), source: 'teacher' },
    });
  } catch (error) {
    errors.value.messages = message(error, 'Не удалось загрузить сообщения');
  }
}

async function loadConsultations(): Promise<void> {
  errors.value.consultations = null;
  try {
    consultations.value = await api<ConsultationDto[]>('/consultations', {
      query: { ...contextQuery(), status: status.value ?? undefined },
    });
  } catch (error) {
    errors.value.consultations = message(error, 'Не удалось загрузить консультации');
  }
}

async function loadStudents(): Promise<void> {
  try {
    const page = await api<StudentPageDto>('/students', {
      query: { groupId: context.groupId, pageSize: 100 },
    });
    students.value = page.items.map((item) => ({
      id: item.id,
      label: `${formatFullName(item)}${item.group ? ` (${item.group.name})` : ''}`,
    }));
  } catch {
    students.value = [];
  }
}

watch(
  () => [context.groupId, context.disciplineId],
  () => {
    void loadRequests();
    void loadMessages();
    void loadConsultations();
    void loadStudents();
  },
  { immediate: true },
);
watch(openOnly, () => void loadRequests());
watch(status, () => void loadConsultations());

function replace<T extends { id: string }>(list: T[] | null, item: T): T[] {
  const rows = list ?? [];
  return rows.some((row) => row.id === item.id)
    ? rows.map((row) => (row.id === item.id ? item : row))
    : [item, ...rows];
}

function onRequestChanged(item: FeedbackDto): void {
  // Рассмотренное обращение уходит из списка «Ждут ответа».
  requests.value =
    openOnly.value && item.resolvedAt
      ? (requests.value ?? []).filter((row) => row.id !== item.id)
      : replace(requests.value, item);
}

function onConsultationChanged(item: ConsultationDto): void {
  consultations.value =
    status.value && item.status !== status.value
      ? (consultations.value ?? []).filter((row) => row.id !== item.id)
      : replace(consultations.value, item);
}
</script>

<template>
  <div class="iot-page feedback">
    <h1>{{ route.meta.title }}</h1>
    <p class="feedback__muted">
      Группа и дисциплина выбираются в шапке. Внутренние заметки видны только преподавателям.
    </p>

    <Tabs v-model:value="tab" scrollable>
      <TabList>
        <Tab value="requests">Обращения студентов</Tab>
        <Tab value="consultations">Консультации</Tab>
        <Tab value="messages">Сообщения студентам</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="requests">
          <div class="feedback__toolbar">
            <SelectButton
              v-model="openOnly"
              :options="openOptions"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              aria-label="Какие обращения показать"
            />
          </div>
          <ErrorState
            v-if="errors.requests"
            :message="errors.requests"
            retryable
            @retry="loadRequests"
          />
          <p v-else-if="!requests" role="status">Загрузка…</p>
          <EmptyState
            v-else-if="requests.length === 0"
            icon="pi pi-inbox"
            :title="openOnly ? 'Нет обращений, ждущих ответа' : 'Обращений пока нет'"
            description="Здесь появятся вопросы студентов, сообщения о затруднениях и предложения изменить маршрут."
          />
          <ul v-else class="feedback__list">
            <li v-for="item in requests" :key="item.id">
              <FeedbackThread :item="item" mode="staff" show-student @changed="onRequestChanged" />
            </li>
          </ul>
        </TabPanel>

        <TabPanel value="consultations">
          <div class="feedback__toolbar">
            <div class="iot-field feedback__filter">
              <label id="consultation-status-label" for="consultation-status">Статус</label>
              <Select
                v-model="status"
                input-id="consultation-status"
                aria-labelledby="consultation-status-label"
                :options="statusOptions"
                option-label="label"
                option-value="value"
                placeholder="Все"
                show-clear
              />
            </div>
            <Button
              label="Назначить консультацию"
              icon="pi pi-calendar-plus"
              @click="consultationOpen = true"
            />
          </div>
          <ErrorState
            v-if="errors.consultations"
            :message="errors.consultations"
            retryable
            @retry="loadConsultations"
          />
          <p v-else-if="!consultations" role="status">Загрузка…</p>
          <EmptyState
            v-else-if="consultations.length === 0"
            icon="pi pi-calendar"
            title="Консультаций нет"
            description="Запросы студентов и назначенные консультации появятся здесь; проведённые остаются в истории."
          />
          <ul v-else class="feedback__list">
            <li v-for="item in consultations" :key="item.id">
              <ConsultationCard
                :item="item"
                mode="staff"
                show-student
                can-manage
                @schedule="actions?.schedule(item)"
                @hold="actions?.hold(item)"
                @cancel="actions?.cancel(item)"
              />
            </li>
          </ul>
        </TabPanel>

        <TabPanel value="messages">
          <div class="feedback__toolbar">
            <Button label="Новое сообщение" icon="pi pi-send" @click="composeOpen = true" />
          </div>
          <ErrorState
            v-if="errors.messages"
            :message="errors.messages"
            retryable
            @retry="loadMessages"
          />
          <p v-else-if="!messages" role="status">Загрузка…</p>
          <EmptyState
            v-else-if="messages.length === 0"
            icon="pi pi-send"
            title="Сообщений пока нет"
            description="Рекомендации, комментарии, краткосрочные цели и запросы самооценки, отправленные студентам."
          />
          <ul v-else class="feedback__list">
            <li v-for="item in messages" :key="item.id">
              <FeedbackThread
                :item="item"
                mode="staff"
                show-student
                @changed="messages = replace(messages, $event)"
              />
            </li>
          </ul>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <ConsultationActions ref="actions" @changed="onConsultationChanged" />
    <ConsultationDialog
      v-model:visible="consultationOpen"
      :students="students"
      @saved="onConsultationChanged"
    />
    <FeedbackComposeDialog
      v-model:visible="composeOpen"
      :students="students"
      @created="messages = replace(messages, $event)"
    />
  </div>
</template>

<style scoped>
.feedback {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.feedback h1 {
  margin: 0;
}

.feedback__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.feedback__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--iot-space-3);
  margin: var(--iot-space-3) 0;
}

.feedback__filter {
  min-width: 12rem;
}

.feedback__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
