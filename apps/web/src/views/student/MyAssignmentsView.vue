<script setup lang="ts">
import {
  type AssignmentChoiceDto,
  type CabinetAssignmentsDto,
  type StudentAssignmentDto,
  studentAssignmentSection,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { assignmentBadge, assignmentMeta, dueText } from '@/views/assignments/status';

/**
 * «Мои задания» (п. 3.2; AT-06): наборы равнозначных заданий на выбор (FR-054), текущие
 * и выполненные задания. Задание открывается карточкой с инструкцией и критериями.
 */
const route = useRoute();
const data = ref<CabinetAssignmentsDto | null>(null);
const error = ref<string | null>(null);
const picked = reactive<Record<string, string[]>>({});
const choiceErrors = reactive<Record<string, string | null>>({});
const busyChoice = ref<string | null>(null);
const notice = ref<string | null>(null);

const current = computed(
  () =>
    data.value?.items.filter((item) => studentAssignmentSection(item.status) === 'current') ?? [],
);
const done = computed(
  () => data.value?.items.filter((item) => studentAssignmentSection(item.status) === 'done') ?? [],
);
const empty = computed(
  () => !!data.value && !data.value.choices.length && !data.value.items.length,
);

async function load(): Promise<void> {
  error.value = null;
  try {
    data.value = await api<CabinetAssignmentsDto>('/cabinet/assignments');
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить задания';
  }
}

async function choose(choice: AssignmentChoiceDto): Promise<void> {
  const optionIds = picked[choice.id] ?? [];
  if (optionIds.length !== choice.requiredCount) {
    choiceErrors[choice.id] = `Выберите заданий: ${choice.requiredCount}`;
    return;
  }
  choiceErrors[choice.id] = null;
  busyChoice.value = choice.id;
  try {
    data.value = await api<CabinetAssignmentsDto>(
      `/cabinet/assignment-choices/${choice.id}/choose`,
      { method: 'POST', body: { optionIds } },
    );
    notice.value = 'Выбор сохранён: задание появилось в списке текущих.';
  } catch (caught) {
    choiceErrors[choice.id] =
      caught instanceof ApiError ? caught.message : 'Не удалось сохранить выбор';
  } finally {
    busyChoice.value = null;
  }
}

const detailsLink = (item: StudentAssignmentDto) => ({
  name: 'student-assignment-details',
  params: { id: item.id },
});

onMounted(load);
</script>

<template>
  <div class="iot-page my-assignments">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!data" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="empty"
      icon="pi pi-file-edit"
      title="Заданий пока нет"
      description="Задания появятся, когда преподаватель утвердит траекторию или назначит задание."
    />
    <template v-else>
      <Message v-if="notice" severity="success" role="status" @close="notice = null">
        {{ notice }}
      </Message>

      <section v-if="data.choices.length" aria-labelledby="my-assignments-choice">
        <h2 id="my-assignments-choice" class="my-assignments__title">Выберите задание</h2>
        <ul class="my-assignments__list">
          <li v-for="choice in data.choices" :key="choice.id" class="iot-card">
            <fieldset class="my-assignments__choice">
              <legend class="my-assignments__name">{{ choice.title }}</legend>
              <p class="my-assignments__muted">
                {{ choice.discipline.name }} · выберите заданий: {{ choice.requiredCount }} из
                {{ choice.options.length }}. Задания равнозначны — берите то, что интереснее.
              </p>
              <div v-for="option in choice.options" :key="option.id" class="my-assignments__option">
                <Checkbox
                  v-model="picked[choice.id]"
                  :input-id="`option-${option.id}`"
                  :value="option.id"
                />
                <label :for="`option-${option.id}`">
                  <span class="my-assignments__option-title">{{ option.assignment.title }}</span>
                  <span class="my-assignments__muted">
                    {{ assignmentMeta(option) }} · {{ dueText(option.dueAt) }}
                  </span>
                </label>
                <RouterLink :to="detailsLink(option)" class="my-assignments__more">
                  Подробнее<span class="iot-visually-hidden">
                    о задании «{{ option.assignment.title }}»</span
                  >
                </RouterLink>
              </div>
              <Message v-if="choiceErrors[choice.id]" severity="error" role="alert">
                {{ choiceErrors[choice.id] }}
              </Message>
              <div>
                <Button
                  label="Подтвердить выбор"
                  icon="pi pi-check"
                  :loading="busyChoice === choice.id"
                  @click="choose(choice)"
                />
              </div>
            </fieldset>
          </li>
        </ul>
      </section>

      <section aria-labelledby="my-assignments-current">
        <h2 id="my-assignments-current" class="my-assignments__title">Текущие</h2>
        <p v-if="current.length === 0" class="my-assignments__muted">Текущих заданий нет.</p>
        <ul v-else class="my-assignments__list">
          <li v-for="item in current" :key="item.id">
            <RouterLink :to="detailsLink(item)" class="iot-card my-assignments__card">
              <span class="my-assignments__name">{{ item.assignment.title }}</span>
              <StatusBadge v-bind="assignmentBadge(item.status)" />
              <span class="my-assignments__muted">{{ item.discipline.name }}</span>
              <span class="my-assignments__muted">{{ assignmentMeta(item) }}</span>
              <span class="my-assignments__due">
                <i class="pi pi-calendar" aria-hidden="true" /> Срок: {{ dueText(item.dueAt) }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="done.length" aria-labelledby="my-assignments-done">
        <h2 id="my-assignments-done" class="my-assignments__title">Выполненные</h2>
        <ul class="my-assignments__list">
          <li v-for="item in done" :key="item.id">
            <RouterLink :to="detailsLink(item)" class="iot-card my-assignments__card">
              <span class="my-assignments__name">{{ item.assignment.title }}</span>
              <StatusBadge v-bind="assignmentBadge(item.status)" />
              <span class="my-assignments__muted">
                {{ item.discipline.name }} · {{ assignmentMeta(item) }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.my-assignments {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.my-assignments h1 {
  margin: 0;
}

.my-assignments__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.0625rem;
}

.my-assignments__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-assignments__card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-1);
  color: inherit;
  text-decoration: none;
}

a.my-assignments__card:hover .my-assignments__name,
a.my-assignments__card:focus-visible .my-assignments__name {
  text-decoration: underline;
}

.my-assignments__name {
  color: var(--iot-color-heading);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.my-assignments__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.my-assignments__due {
  display: inline-flex;
  gap: var(--iot-space-1);
  align-items: center;
  font-size: 0.875rem;
}

.my-assignments__choice {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.my-assignments__option {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--iot-space-1) var(--iot-space-2);
  align-items: start;
  padding: var(--iot-space-2);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
}

.my-assignments__option label {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  cursor: pointer;
}

.my-assignments__option-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.my-assignments__more {
  grid-column: 2;
  font-size: 0.875rem;
}
</style>
