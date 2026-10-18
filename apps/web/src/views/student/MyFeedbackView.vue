<script setup lang="ts">
import {
  type CabinetConsultationDto,
  type CabinetFeedbackDto,
  type CabinetFeedbackTrajectoryDto,
  type FeedbackDto,
  FeedbackKind,
  type PendingReflectionDto,
  type ReflectionDto,
  ROUTE_PROPOSAL_STATUSES,
} from '@iot/shared';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import type { MenuItem } from 'primevue/menuitem';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import InteractionTimeline from '@/views/feedback/InteractionTimeline.vue';
import ReflectionDialog from './ReflectionDialog.vue';
import RouteProposalDialog from './RouteProposalDialog.vue';
import StudentRequestDialog from './StudentRequestDialog.vue';

/**
 * «Обратная связь» студента (п. 4.9): рекомендации и цели преподавателя, вопросы,
 * сообщения о затруднениях, консультации, рефлексия после контрольных точек (FR-066)
 * и предложение изменить маршрут. Внутренние заметки преподавателя сюда не приходят (FR-068).
 */
const route = useRoute();
const data = ref<CabinetFeedbackDto | null>(null);
const error = ref<string | null>(null);
const requestKind = ref<'QUESTION' | 'DIFFICULTY_REPORT' | 'CONSULTATION'>('QUESTION');
const requestOpen = ref(false);
const reflectionOpen = ref(false);
const reflectCheckpoint = ref<PendingReflectionDto | null>(null);
const reflectRequest = ref<FeedbackDto | null>(null);
const proposalOpen = ref(false);
const proposalTrajectory = ref<CabinetFeedbackTrajectoryDto | null>(null);
const proposalMenu = ref<InstanceType<typeof Menu>>();
const notice = ref<string | null>(null);

const openRequests = computed(
  () =>
    data.value?.feedback.filter(
      (item) => item.kind === FeedbackKind.SELF_ASSESSMENT_REQUEST && !item.resolvedAt,
    ) ?? [],
);
const proposable = computed(
  () =>
    data.value?.trajectories.filter((item) => ROUTE_PROPOSAL_STATUSES.includes(item.status)) ?? [],
);
const proposalItems = computed<MenuItem[]>(() =>
  proposable.value.map((item) => ({
    label: item.disciplineName,
    command: () => openProposal(item),
  })),
);
const waiting = computed(
  () => (data.value?.pendingReflections.length ?? 0) + openRequests.value.length,
);

async function load(): Promise<void> {
  error.value = null;
  try {
    data.value = await api<CabinetFeedbackDto>('/cabinet/feedback');
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить данные';
  }
}

onMounted(load);

function ask(kind: 'QUESTION' | 'DIFFICULTY_REPORT' | 'CONSULTATION'): void {
  requestKind.value = kind;
  requestOpen.value = true;
}

function reflect(checkpoint: PendingReflectionDto | null, request: FeedbackDto | null): void {
  reflectCheckpoint.value = checkpoint;
  reflectRequest.value = request;
  reflectionOpen.value = true;
}

function openProposal(item: CabinetFeedbackTrajectoryDto): void {
  proposalTrajectory.value = item;
  proposalOpen.value = true;
}

function propose(event: Event): void {
  if (proposable.value.length === 1) openProposal(proposable.value[0]!);
  else proposalMenu.value?.toggle(event);
}

function onCreated(item: FeedbackDto): void {
  if (data.value) data.value.feedback = [item, ...data.value.feedback];
  notice.value = 'Обращение отправлено. Преподаватель получил уведомление.';
}

function onRequested(item: CabinetConsultationDto): void {
  if (data.value) data.value.consultations = [item, ...data.value.consultations];
  notice.value = 'Запрос консультации отправлен. Время назначит преподаватель.';
}

function onFeedbackChanged(item: FeedbackDto): void {
  if (!data.value) return;
  data.value.feedback = data.value.feedback.map((row) => (row.id === item.id ? item : row));
}

function onReflected(_item: ReflectionDto): void {
  notice.value = 'Спасибо! Рефлексия отправлена преподавателю.';
  void load();
}

function onProposed(): void {
  notice.value = 'Предложение отправлено преподавателю.';
  void load();
}
</script>

<template>
  <div class="iot-page my-feedback">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <template v-else>
      <p v-if="notice" class="my-feedback__notice" role="status">
        <i class="pi pi-check-circle" aria-hidden="true" /> {{ notice }}
      </p>

      <section class="my-feedback__section" aria-labelledby="my-feedback-waiting">
        <h2 id="my-feedback-waiting" class="my-feedback__title">Ждут вашего ответа</h2>
        <p v-if="waiting === 0" class="my-feedback__muted">
          Сейчас ничего не нужно заполнять. После контрольных точек здесь появится форма рефлексии.
        </p>
        <ul v-else class="my-feedback__list">
          <li
            v-for="item in data.pendingReflections"
            :key="item.checkpointId"
            class="iot-card my-feedback__task"
          >
            <StatusBadge
              :label="item.status === 'PASSED' ? 'Точка пройдена' : 'Точка пропущена'"
              :tone="item.status === 'PASSED' ? 'success' : 'warning'"
            />
            <strong>Рефлексия: «{{ item.title }}»</strong>
            <span class="my-feedback__muted">
              {{ item.trajectory.disciplineName }} · этап {{ item.stage.sortOrder + 1 }}.
              {{ item.stage.title }}
              <template v-if="item.dueDate"> · {{ formatDate(item.dueDate) }}</template>
            </span>
            <Button
              label="Заполнить рефлексию"
              icon="pi pi-pencil"
              size="small"
              @click="reflect(item, null)"
            />
          </li>
          <li v-for="item in openRequests" :key="item.id" class="iot-card my-feedback__task">
            <StatusBadge label="Запрос самооценки" tone="info" icon="pi pi-star" />
            <strong>{{ item.body }}</strong>
            <span class="my-feedback__muted">
              {{ item.author.fullName }}
              <template v-if="item.dueDate"> · ответить до {{ formatDate(item.dueDate) }}</template>
            </span>
            <Button
              label="Оценить себя"
              icon="pi pi-star"
              size="small"
              @click="reflect(null, item)"
            />
          </li>
        </ul>
      </section>

      <section class="my-feedback__section" aria-labelledby="my-feedback-actions">
        <h2 id="my-feedback-actions" class="my-feedback__title">Написать преподавателю</h2>
        <div class="my-feedback__actions">
          <Button
            label="Задать вопрос"
            icon="pi pi-question-circle"
            outlined
            @click="ask('QUESTION')"
          />
          <Button
            label="Сообщить о затруднении"
            icon="pi pi-exclamation-triangle"
            outlined
            @click="ask('DIFFICULTY_REPORT')"
          />
          <Button
            label="Запросить консультацию"
            icon="pi pi-calendar-plus"
            outlined
            @click="ask('CONSULTATION')"
          />
          <Button
            label="Предложить изменение маршрута"
            icon="pi pi-directions"
            outlined
            :disabled="proposable.length === 0"
            aria-haspopup="true"
            @click="propose"
          />
          <Menu ref="proposalMenu" :model="proposalItems" popup />
        </div>
        <p v-if="proposable.length === 0" class="my-feedback__muted">
          Предложить изменение можно, когда у вас есть действующая траектория.
        </p>
      </section>

      <section class="my-feedback__section" aria-labelledby="my-feedback-history">
        <h2 id="my-feedback-history" class="my-feedback__title">
          Рекомендации, консультации и история
        </h2>
        <InteractionTimeline
          :feedback="data.feedback"
          :consultations="data.consultations"
          :reflections="data.reflections"
          mode="student"
          empty-text="Здесь появятся рекомендации и цели преподавателя, ваши вопросы, консультации и рефлексия."
          @feedback-changed="onFeedbackChanged"
          @reflect="reflect(null, $event)"
        />
      </section>
    </template>

    <StudentRequestDialog
      v-model:visible="requestOpen"
      :kind="requestKind"
      :trajectories="data?.trajectories ?? []"
      @created="onCreated"
      @requested="onRequested"
    />
    <ReflectionDialog
      v-model:visible="reflectionOpen"
      :checkpoint="reflectCheckpoint"
      :request="reflectRequest"
      @saved="onReflected"
    />
    <RouteProposalDialog
      v-if="proposalTrajectory"
      v-model:visible="proposalOpen"
      :trajectory-id="proposalTrajectory.id"
      :stages="proposalTrajectory.stages"
      @created="onProposed"
    />
  </div>
</template>

<style scoped>
.my-feedback {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.my-feedback h1 {
  margin: 0;
}

.my-feedback__section {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.my-feedback__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.125rem;
}

.my-feedback__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.my-feedback__notice {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
  margin: 0;
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-info-border);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-info-text);
}

.my-feedback__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-feedback__task {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-2);
}

.my-feedback__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

@media (max-width: 479px) {
  .my-feedback__actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
