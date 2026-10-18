<script setup lang="ts">
import {
  MOTIVATION_LEVEL_LABELS,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import StepsHeader from './StepsHeader.vue';

/**
 * Конструктор ИОТ, шаг 1 (UC-03): дисциплина и шаблон. Система предлагает шаблон по
 * утверждённому мотивационному профилю (FR-035), преподаватель выбирает любой шаблон или
 * создаёт маршрут с нуля (FR-034). После создания черновика конструктор продолжается на
 * странице ИОТ.
 */
const route = useRoute();
const router = useRouter();
const studentId = computed(() =>
  typeof route.query.studentId === 'string' ? route.query.studentId : null,
);
const options = ref<TrajectoryOptionsDto | null>(null);
const loadError = ref<string | null>(null);
const disciplineId = ref<string | null>(null);
/** id шаблона или 'scratch' — с нуля. */
const templateId = ref<string>('scratch');
const busy = ref(false);
const createError = ref<string | null>(null);
let idempotencyKey = newIdempotencyKey();

const existing = computed(
  () =>
    options.value?.disciplines.find((item) => item.id === disciplineId.value)
      ?.currentTrajectoryId ?? null,
);

async function load(): Promise<void> {
  if (!studentId.value) return;
  options.value = null;
  loadError.value = null;
  try {
    const result = await api<TrajectoryOptionsDto>(
      `/students/${studentId.value}/trajectory-options`,
    );
    options.value = result;
    disciplineId.value =
      result.disciplines.find((item) => !item.currentTrajectoryId)?.id ??
      result.disciplines[0]?.id ??
      null;
    templateId.value = result.suggestedTemplateId ?? 'scratch';
  } catch (caught) {
    loadError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось загрузить данные студента';
  }
}

watch(studentId, load, { immediate: true });
watch([disciplineId, templateId], () => {
  idempotencyKey = newIdempotencyKey();
  createError.value = null;
});

async function create(): Promise<void> {
  if (!options.value || !disciplineId.value) return;
  busy.value = true;
  createError.value = null;
  try {
    const created = await api<TrajectoryDto>('/trajectories', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        studentId: options.value.student.id,
        disciplineId: disciplineId.value,
        templateId: templateId.value === 'scratch' ? null : templateId.value,
      },
    });
    await router.replace(`/trajectories/${created.id}`);
  } catch (caught) {
    createError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось создать ИОТ. Повторите попытку';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="iot-page new-trajectory">
    <RouterLink
      :to="studentId ? `/students/${studentId}?tab=trajectory` : '/trajectories'"
      class="new-trajectory__back"
    >
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ studentId ? 'Профиль студента' : 'Индивидуальные траектории' }}
    </RouterLink>
    <h1>
      Новая ИОТ<template v-if="options"> · {{ options.student.fullName }}</template>
    </h1>
    <StepsHeader :current="0" readonly />

    <EmptyState
      v-if="!studentId"
      icon="pi pi-user"
      title="Выберите студента"
      description="ИОТ создаётся из профиля студента: «Студенты» → студент → «Создать ИОТ»."
    >
      <RouterLink to="/students" class="p-button p-button-outlined">Открыть «Студенты»</RouterLink>
    </EmptyState>
    <ErrorState v-else-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="!options" role="status">Загрузка…</p>
    <Message v-else-if="options.blockedReason" severity="warn" role="alert">
      {{ options.blockedReason }}
    </Message>
    <EmptyState
      v-else-if="options.disciplines.length === 0"
      icon="pi pi-book"
      title="Нет дисциплин для ИОТ"
      description="Вы не ведёте ни одной дисциплины в группе этого студента. Закрепление настраивает администратор."
    />
    <form v-else class="iot-card iot-form new-trajectory__form" novalidate @submit.prevent="create">
      <h2>① Дисциплина и шаблон</h2>
      <div class="iot-field">
        <label for="new-discipline">Дисциплина</label>
        <Select
          v-model="disciplineId"
          input-id="new-discipline"
          :options="options.disciplines"
          option-label="name"
          option-value="id"
          fluid
        />
        <small v-if="existing" class="iot-field-hint">
          По этой дисциплине у студента уже есть действующая ИОТ:
          <RouterLink :to="`/trajectories/${existing}`">открыть</RouterLink>. По разным дисциплинам
          можно вести несколько ИОТ.
        </small>
      </div>

      <div class="new-trajectory__profile">
        <span class="iot-field__label">Мотивационный профиль</span>
        <template v-if="options.profile">
          <StatusBadge :label="MOTIVATION_LEVEL_LABELS[options.profile.level]" tone="info" />
          <span class="new-trajectory__muted">
            утверждён {{ formatDate(options.profile.decidedAt) }}
          </span>
        </template>
        <span v-else class="new-trajectory__muted">
          Профиль не утверждён — предложен стандартный шаблон.
        </span>
      </div>

      <fieldset class="new-trajectory__templates">
        <legend class="iot-field__label">Шаблон маршрута</legend>
        <div
          v-for="template in options.templates"
          :key="template.id"
          class="new-trajectory__option"
        >
          <RadioButton
            v-model="templateId"
            :input-id="`template-${template.id}`"
            :value="template.id"
            name="template"
          />
          <label :for="`template-${template.id}`">
            <span class="new-trajectory__title">
              {{ template.title }}
              <StatusBadge
                v-if="template.id === options.suggestedTemplateId"
                label="Предложено по профилю"
                tone="info"
                icon="pi pi-lightbulb"
              />
            </span>
            <span class="new-trajectory__muted">
              {{ template.description }} Этапов: {{ template.stages.length }}.
            </span>
          </label>
        </div>
        <div class="new-trajectory__option">
          <RadioButton
            v-model="templateId"
            input-id="template-scratch"
            value="scratch"
            name="template"
          />
          <label for="template-scratch">
            <span class="new-trajectory__title">Создать с нуля</span>
            <span class="new-trajectory__muted">Этапы добавляются вручную.</span>
          </label>
        </div>
      </fieldset>

      <Message severity="info" :closable="false">
        Шаблон — предложение системы; окончательное решение принимает преподаватель. Профиль не
        ограничивает сложность заданий.
      </Message>
      <Message v-if="createError" severity="error" role="alert">{{ createError }}</Message>
      <div class="iot-form-buttons">
        <Button
          type="submit"
          label="Создать черновик и продолжить"
          icon="pi pi-arrow-right"
          icon-pos="right"
          :loading="busy"
          :disabled="!disciplineId || !!existing"
        />
      </div>
    </form>
  </div>
</template>

<style scoped>
.new-trajectory {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.new-trajectory h1,
.new-trajectory h2 {
  margin: 0;
}

.new-trajectory h2 {
  font-size: 1.125rem;
}

.new-trajectory__back {
  align-self: flex-start;
}

.new-trajectory__form {
  max-width: 720px;
}

.new-trajectory__profile {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
}

.new-trajectory__templates {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

.new-trajectory__option {
  display: flex;
  gap: var(--iot-space-2);
  align-items: flex-start;
}

.new-trajectory__option label {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  cursor: pointer;
}

.new-trajectory__title {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  font-weight: 600;
}

.new-trajectory__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
