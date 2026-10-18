<script setup lang="ts">
import {
  FEEDBACK_TEXT_MAX,
  type FeedbackDto,
  FeedbackKind,
  RESOLVABLE_FEEDBACK_KINDS,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { computed, ref } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate, formatDateTime } from '@/utils/format';
import { bindingText, INTERNAL_BADGE, kindBadge, resolutionBadge } from './content';

/**
 * Ветка обратной связи: сообщение, привязка (FR-064), ответы и форма ответа. Преподаватель
 * видит внутренние заметки с пометкой и может ответить внутренней заметкой (FR-068); студенту
 * сервер их не передаёт. Обращение студента преподаватель отмечает рассмотренным.
 */
const props = withDefaults(
  defineProps<{
    item: FeedbackDto;
    mode: 'staff' | 'student';
    /** Показывать студента и ссылку на профиль (списки раздела «Обратная связь»). */
    showStudent?: boolean;
    /** Можно ли отвечать (например, студент в архиве — нельзя). */
    canReply?: boolean;
  }>(),
  { showStudent: false, canReply: true },
);
const emit = defineEmits<{ changed: [item: FeedbackDto]; reflect: [item: FeedbackDto] }>();

const staff = computed(() => props.mode === 'staff');
const internalThread = computed(() => props.item.visibility === 'INTERNAL');
const resolution = computed(() => resolutionBadge(props.item));
const canResolve = computed(
  () =>
    staff.value && !props.item.resolvedAt && RESOLVABLE_FEEDBACK_KINDS.includes(props.item.kind),
);
const awaitsSelfAssessment = computed(
  () =>
    props.mode === 'student' &&
    props.item.kind === FeedbackKind.SELF_ASSESSMENT_REQUEST &&
    !props.item.resolvedAt,
);
const authorLabel = (fromStudent: boolean, name: string) =>
  props.mode === 'student' && fromStudent ? 'Вы' : name;

const replying = ref(false);
const body = ref('');
const internal = ref(false);
const bodyError = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();
const fieldId = computed(() => `reply-${props.item.id}`);

function openReply(): void {
  replying.value = true;
  body.value = '';
  internal.value = false;
  bodyError.value = null;
  error.value = null;
  idempotencyKey = newIdempotencyKey();
}

async function sendReply(): Promise<void> {
  const text = body.value.trim();
  bodyError.value = text ? null : 'Напишите ответ';
  if (bodyError.value) return;
  busy.value = true;
  error.value = null;
  try {
    const path = staff.value
      ? `/feedback/${props.item.id}/replies`
      : `/cabinet/feedback/${props.item.id}/replies`;
    const updated = await api<FeedbackDto>(path, {
      method: 'POST',
      body: staff.value
        ? { body: text, visibility: internal.value ? 'INTERNAL' : 'STUDENT_VISIBLE' }
        : { body: text },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    replying.value = false;
    emit('changed', updated);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось отправить ответ';
  } finally {
    busy.value = false;
  }
}

async function resolve(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    emit(
      'changed',
      await api<FeedbackDto>(`/feedback/${props.item.id}/resolve`, { method: 'POST' }),
    );
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось отметить обращение';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <article class="thread iot-card" :aria-label="kindBadge(item.kind).label">
    <div class="thread__badges">
      <StatusBadge v-bind="kindBadge(item.kind)" />
      <StatusBadge v-if="staff && internalThread" v-bind="INTERNAL_BADGE" />
      <StatusBadge v-if="resolution" v-bind="resolution" />
    </div>
    <p class="thread__meta">
      <span>{{ authorLabel(item.fromStudent, item.author.fullName) }}</span>
      <span>· {{ formatDateTime(item.createdAt) }}</span>
      <template v-if="showStudent">
        ·
        <RouterLink :to="{ path: `/students/${item.student.id}`, query: { tab: 'support' } }">
          {{ item.student.fullName }}
        </RouterLink>
        <span v-if="item.student.groupName">({{ item.student.groupName }})</span>
      </template>
    </p>
    <p class="thread__binding">
      <i class="pi pi-link" aria-hidden="true" /> {{ bindingText(item) }}
    </p>
    <p class="thread__body">{{ item.body }}</p>
    <p v-if="item.dueDate" class="thread__due">
      <i class="pi pi-calendar" aria-hidden="true" />
      {{ item.kind === 'SHORT_TERM_GOAL' ? 'Срок цели' : 'Ответить до' }}:
      {{ formatDate(item.dueDate) }}
    </p>

    <ol v-if="item.replies.length > 0" class="thread__replies" aria-label="Ответы">
      <li
        v-for="reply in item.replies"
        :key="reply.id"
        class="thread__reply"
        :class="{ 'thread__reply--internal': reply.visibility === 'INTERNAL' }"
      >
        <p class="thread__meta">
          <span>{{ authorLabel(reply.fromStudent, reply.author.fullName) }}</span>
          <span>· {{ formatDateTime(reply.createdAt) }}</span>
          <StatusBadge v-if="staff && reply.visibility === 'INTERNAL'" v-bind="INTERNAL_BADGE" />
        </p>
        <p class="thread__body">{{ reply.body }}</p>
      </li>
    </ol>

    <form v-if="replying" class="thread__form iot-form" novalidate @submit.prevent="sendReply">
      <div class="iot-field">
        <label :for="fieldId">Ответ</label>
        <Textarea
          :id="fieldId"
          v-model="body"
          rows="3"
          :maxlength="FEEDBACK_TEXT_MAX"
          :invalid="!!bodyError"
          :aria-describedby="`${fieldId}-error`"
          fluid
        />
        <small v-if="bodyError" :id="`${fieldId}-error`" class="iot-field-error">
          {{ bodyError }}
        </small>
      </div>
      <div v-if="staff && !internalThread" class="thread__check">
        <Checkbox v-model="internal" :input-id="`${fieldId}-internal`" binary />
        <label :for="`${fieldId}-internal`">Внутренняя заметка — студент её не увидит</label>
      </div>
      <p v-if="staff && internalThread" class="iot-field-hint">
        Ответ во внутренней заметке тоже виден только преподавателям.
      </p>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" text @click="replying = false" />
        <Button type="submit" label="Отправить" icon="pi pi-send" :loading="busy" />
      </div>
    </form>

    <Message v-if="error" severity="error" role="alert">{{ error }}</Message>

    <div v-if="!replying && canReply" class="thread__actions">
      <Button
        v-if="awaitsSelfAssessment"
        label="Оценить себя"
        icon="pi pi-star"
        size="small"
        @click="emit('reflect', item)"
      />
      <Button label="Ответить" icon="pi pi-reply" size="small" outlined @click="openReply" />
      <Button
        v-if="canResolve"
        label="Отметить рассмотренным"
        icon="pi pi-check"
        size="small"
        text
        :loading="busy"
        @click="resolve"
      />
    </div>
  </article>
</template>

<style scoped>
.thread {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.thread p {
  margin: 0;
}

.thread__badges,
.thread__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.thread__meta,
.thread__binding,
.thread__due {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-1);
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.thread__body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.thread__replies {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0 0 0 var(--iot-space-3);
  border-left: 3px solid var(--iot-color-info-border);
  list-style: none;
}

.thread__reply {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.thread__reply--internal {
  padding: var(--iot-space-2);
  border-radius: var(--iot-radius);
  background: var(--iot-tone-neutral-bg);
}

.thread__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}
</style>
