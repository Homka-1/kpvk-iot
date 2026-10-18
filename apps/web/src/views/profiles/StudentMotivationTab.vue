<script setup lang="ts">
import {
  MEASUREMENT_TYPE_LABELS,
  MOTIVATION_LEVEL_LABELS,
  MOTIVATION_LEVELS,
  MOTIVATION_PROFILE_STATUS_LABELS,
  type MotivationProfileDto,
  type MotivationStrategiesDto,
  Permission,
  type StudentMotivationDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import { NO_DATA, profileBadge } from '@/views/students/labels';
import ProfileDecisionDialog from './ProfileDecisionDialog.vue';
import StrategyCard from './StrategyCard.vue';

/**
 * Вкладка «Мотивационный профиль» (п. 4.3, 4.5; UC-02). Система предлагает уровень по правилам
 * интерпретации и показывает основания (FR-027, FR-028); уровень присваивает преподаватель —
 * подтверждением или корректировкой с причиной (FR-029). Карточки стратегий (FR-030),
 * переход к конструктору ИОТ (FR-031), история (FR-032).
 */
const props = defineProps<{ studentId: string; archived: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const auth = useAuthStore();
const canManage = computed(() => auth.hasPermission(Permission.PROFILES_MANAGE));

const data = ref<StudentMotivationDto | null>(null);
const strategies = ref<MotivationStrategiesDto | null>(null);
const error = ref<string | null>(null);
const forming = ref(false);
const formError = ref<string | null>(null);
const notice = ref<string | null>(null);
const decisionOpen = ref(false);

const current = computed(() => data.value?.current ?? null);
const decided = computed(() => data.value?.lastDecided ?? null);
/** Предложение системы, по которому нужно решение преподавателя. */
const pending = computed(() => (current.value?.status === 'PROPOSED' ? current.value : null));

const message = (caught: unknown, fallback: string) =>
  caught instanceof ApiError ? caught.message : fallback;

async function load(): Promise<void> {
  error.value = null;
  try {
    const [loaded, texts] = await Promise.all([
      api<StudentMotivationDto>(`/students/${props.studentId}/motivation-profile`),
      canManage.value
        ? api<MotivationStrategiesDto>('/motivation-strategies')
        : Promise.resolve(null),
    ]);
    strategies.value = texts;
    data.value = loaded;
  } catch (caught) {
    error.value = message(caught, 'Не удалось загрузить мотивационный профиль');
  }
}

watch(
  () => props.studentId,
  () => {
    data.value = null;
    notice.value = null;
    void load();
  },
  { immediate: true },
);

async function formProfile(): Promise<void> {
  forming.value = true;
  formError.value = null;
  notice.value = null;
  const before = current.value?.id;
  try {
    const profile = await api<MotivationProfileDto>(
      `/students/${props.studentId}/motivation-profiles`,
      { method: 'POST', headers: { 'Idempotency-Key': newIdempotencyKey() } },
    );
    if (profile.id === before) {
      notice.value = 'Новых результатов диагностики нет: профиль сформирован по актуальным данным.';
    }
    await load();
    emit('changed');
  } catch (caught) {
    formError.value = message(caught, 'Не удалось сформировать профиль');
  } finally {
    forming.value = false;
  }
}

function onDecided(): void {
  notice.value = null;
  void load();
  emit('changed');
}

const historyLabel = (status: keyof typeof MOTIVATION_PROFILE_STATUS_LABELS) =>
  MOTIVATION_PROFILE_STATUS_LABELS[status];
const levelText = (level: keyof typeof MOTIVATION_LEVEL_LABELS | null) =>
  level ? MOTIVATION_LEVEL_LABELS[level] : 'нет уровня';
</script>

<template>
  <ErrorState v-if="error" :message="error" retryable @retry="load" />
  <p v-else-if="!data" role="status">Загрузка…</p>
  <div v-else class="motivation">
    <div v-if="canManage && !archived" class="motivation__actions">
      <Button
        :label="current ? 'Сформировать заново' : 'Сформировать предварительный профиль'"
        icon="pi pi-refresh"
        :loading="forming"
        :outlined="!!current"
        @click="formProfile"
      />
      <Button
        v-if="pending"
        label="Подтвердить или скорректировать"
        icon="pi pi-check-square"
        @click="decisionOpen = true"
      />
      <!-- FR-031: переход к конструктору ИОТ с утверждённым профилем. -->
      <RouterLink
        v-if="decided"
        class="p-button p-button-outlined motivation__link"
        :to="{ name: 'trajectory-new', query: { studentId } }"
      >
        <i class="pi pi-directions" aria-hidden="true" /> Сформировать ИОТ
      </RouterLink>
    </div>
    <Message v-if="formError" severity="error" role="alert">{{ formError }}</Message>
    <Message v-if="notice" severity="info" role="status">{{ notice }}</Message>

    <EmptyState
      v-if="!current"
      icon="pi pi-id-card"
      title="Мотивационный профиль не сформирован"
      description="Профиль формируется по завершённой диагностике и утверждается преподавателем."
    />

    <template v-else>
      <section class="iot-card motivation__summary" aria-labelledby="motivation-current">
        <h2 id="motivation-current" class="motivation__title">Текущий профиль</h2>
        <div class="motivation__status">
          <StatusBadge v-bind="profileBadge(current)" />
          <span class="motivation__muted">
            {{ MOTIVATION_PROFILE_STATUS_LABELS[current.status] }} ·
            {{ formatDateTime(current.decidedAt ?? current.createdAt) }}
            <template v-if="current.decidedBy">· {{ current.decidedBy.fullName }}</template>
          </span>
        </div>
        <p v-if="current.status === 'NEEDS_MORE_DIAGNOSTICS'" class="motivation__text">
          {{ current.basis?.reason }} Уровень не присваивается — назначьте дополнительную
          диагностику в разделе «Диагностика».
        </p>
        <p v-if="pending" class="motivation__text">
          Система предлагает: <strong>{{ levelText(pending.proposedLevel) }}</strong
          >. Это предложение; профиль начнёт действовать после решения преподавателя.
        </p>
        <p v-if="current.correctionReason" class="motivation__text">
          Предложено: {{ levelText(current.proposedLevel) }}. Причина корректировки:
          {{ current.correctionReason }}
        </p>
        <div v-if="current.level" class="motivation__student-text">
          <span class="motivation__muted">Пояснение для студента</span>
          <p class="motivation__text">{{ current.studentSummary ?? 'Пояснение не добавлено' }}</p>
        </div>
        <p v-if="pending && decided" class="motivation__muted" data-testid="last-decided">
          Действующее решение: {{ levelText(decided.level) }}, {{ formatDate(decided.decidedAt) }}.
        </p>
      </section>

      <section v-if="current.basis" aria-labelledby="motivation-basis">
        <h2 id="motivation-basis" class="motivation__title">Основания профиля</h2>
        <p class="motivation__muted">
          Последнее завершённое прохождение каждой методики; учитываются шкалы, для которых в
          правилах интерпретации задан уровень профиля. Уровень предлагается, если на него указало
          большинство шкал (не меньше {{ current.basis.minScales }}).
        </p>
        <p v-if="current.basis.items.length === 0" class="motivation__muted">{{ NO_DATA }}</p>
        <div v-else class="motivation__table-wrap">
          <table class="motivation__table" aria-label="Показатели, повлиявшие на профиль">
            <thead>
              <tr>
                <th scope="col">Методика и замер</th>
                <th scope="col">Шкала</th>
                <th scope="col">Балл</th>
                <th scope="col">Уровень шкалы</th>
                <th scope="col">Указывает на</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in current.basis.items" :key="`${item.sessionId}-${item.scaleCode}`">
                <td>
                  {{ item.questionnaire.title }}, версия {{ item.questionnaire.versionNumber }}
                  <span class="motivation__muted">
                    {{ MEASUREMENT_TYPE_LABELS[item.measurementType] }} ·
                    {{ formatDate(item.completedAt) }}
                  </span>
                </td>
                <td>{{ item.scaleName }}</td>
                <td>{{ item.rawScore === null ? NO_DATA : formatNumber(item.rawScore) }}</td>
                <td>
                  {{ item.levelLabel ?? NO_DATA }}
                  <span v-if="item.description" class="motivation__muted">
                    {{ item.description }}
                  </span>
                </td>
                <td>
                  {{
                    item.motivationLevel ? MOTIVATION_LEVEL_LABELS[item.motivationLevel] : NO_DATA
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="motivation__muted">
          Учитывайте также педагогические наблюдения (вкладка «Сопровождение») и успеваемость по
          дисциплинам. Успеваемость: {{ NO_DATA.toLowerCase() }}.
        </p>
      </section>
    </template>

    <section v-if="strategies" aria-labelledby="motivation-strategies">
      <h2 id="motivation-strategies" class="motivation__title">
        Профили и стратегии сопровождения
      </h2>
      <div class="motivation__strategies">
        <StrategyCard
          v-for="level in MOTIVATION_LEVELS"
          :key="level"
          :level="level"
          :items="strategies[level]"
          :current="decided?.level === level"
        />
      </div>
      <p class="motivation__muted">
        <i class="pi pi-info-circle" aria-hidden="true" /> Профиль помогает выбрать поддержку и не
        ограничивает сложность заданий: задания любого уровня доступны каждому студенту.
      </p>
    </section>

    <section aria-labelledby="motivation-history">
      <h2 id="motivation-history" class="motivation__title">История профиля</h2>
      <p v-if="data.history.length === 0" class="motivation__muted">Изменений пока нет</p>
      <ol v-else class="motivation__history">
        <li v-for="item in data.history" :key="item.id">
          <span class="motivation__muted">{{ formatDateTime(item.at) }}</span>
          <strong>{{ historyLabel(item.status) }}</strong>
          <span>
            <template v-if="item.fromLevel">{{ levelText(item.fromLevel) }} → </template>
            {{ levelText(item.toLevel) }}
          </span>
          <span v-if="item.changedBy" class="motivation__muted">{{ item.changedBy.fullName }}</span>
          <span v-if="item.reason">Причина: {{ item.reason }}</span>
        </li>
      </ol>
    </section>

    <ProfileDecisionDialog
      v-if="pending"
      v-model:visible="decisionOpen"
      :profile="pending"
      @saved="onDecided"
    />
  </div>
</template>

<style scoped>
.motivation {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.motivation__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.motivation__link {
  gap: var(--iot-space-2);
  text-decoration: none;
}

.motivation__summary {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.motivation__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1rem;
}

.motivation__summary .motivation__title {
  margin: 0;
}

.motivation__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.motivation__muted {
  display: block;
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.motivation__status .motivation__muted {
  display: inline;
}

.motivation__text {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.motivation__table-wrap {
  margin: var(--iot-space-2) 0;
  overflow-x: auto;
}

.motivation__table {
  width: 100%;
  border-collapse: collapse;
}

.motivation__table th,
.motivation__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
  vertical-align: top;
}

.motivation__table th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.motivation__strategies {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: var(--iot-space-3);
  margin-bottom: var(--iot-space-2);
}

.motivation__history {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.motivation__history li {
  display: flex;
  flex-direction: column;
  padding-bottom: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
}
</style>
