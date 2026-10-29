<script setup lang="ts">
import {
  CONTROL_KIND_LABELS,
  CONTROL_MARK_LABELS,
  CONTROL_MARKS,
  type ControlOptionsDto,
  type ControlWorkDetailDto,
  type ControlWorkGroupStatsDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import ErrorState from '@/components/ErrorState.vue';
import { formatDate } from '@/utils/format';
import StatsTable, { type StatsRow } from '@/views/analytics/StatsTable.vue';
import ControlSheet from './ControlSheet.vue';
import ControlWorkDialog from './ControlWorkDialog.vue';
import { KIND_ICONS } from './format';

/**
 * Контрольная работа (этап 28): тема, вид контроля, критерии оценивания, сравнение групп по
 * одинаковому заданию (n, среднее, медиана, SD, минимум, максимум; отметки и «нет данных» —
 * отдельно, в расчёт не входят — FR-074) и ведомости групп для ввода результатов.
 */
const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const detail = ref<ControlWorkDetailDto | null>(null);
const options = ref<ControlOptionsDto | null>(null);
const error = ref<string | null>(null);
const groupId = ref<string | null>(null);
const editOpen = ref(false);
const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

const work = computed(() => detail.value?.work ?? null);

function marksHint(item: ControlWorkGroupStatsDto): string {
  const parts = CONTROL_MARKS.filter((mark) => item.marks[mark] > 0).map(
    (mark) => `${CONTROL_MARK_LABELS[mark].toLowerCase()}: ${item.marks[mark]}`,
  );
  if (item.noData > 0) parts.push(`нет данных: ${item.noData}`);
  return [formatDate(item.date), ...parts].join(' · ');
}

const statsRows = computed<StatsRow[]>(() =>
  (detail.value?.groups ?? []).map((item) => ({
    key: item.group.id,
    label: item.group.name,
    hint: marksHint(item),
    stats: item.stats,
  })),
);

async function load(): Promise<void> {
  error.value = null;
  try {
    detail.value = await api<ControlWorkDetailDto>(`/control-works/${id.value}`);
    const groups = detail.value.work.groups.map((item) => item.group.id);
    if (!groupId.value || !groups.includes(groupId.value)) groupId.value = groups[0] ?? null;
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить работу';
  }
}

async function openEdit(): Promise<void> {
  options.value ??= await api<ControlOptionsDto>('/control-works/options');
  editOpen.value = true;
}

async function remove(): Promise<void> {
  deleting.value = true;
  deleteError.value = null;
  try {
    await api(`/control-works/${id.value}`, { method: 'DELETE' });
    deleteOpen.value = false;
    await router.push({ name: 'achievements' });
  } catch (failure) {
    deleteError.value = failure instanceof ApiError ? failure.message : 'Не удалось удалить';
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="iot-page work">
    <RouterLink :to="{ name: 'achievements' }" class="work__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> К академическим достижениям
    </RouterLink>
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!detail || !work" role="status">Загрузка…</p>
    <template v-else>
      <section class="iot-card work__card" aria-labelledby="work-topic">
        <span class="work__kind">
          <i :class="KIND_ICONS[work.kind]" aria-hidden="true" />
          {{ CONTROL_KIND_LABELS[work.kind] }}
        </span>
        <h2 id="work-topic" class="work__topic">{{ work.topic }}</h2>
        <p class="work__muted">
          {{ work.discipline.name }}
          <template v-if="work.author"> · создал(а): {{ work.author.fullName }}</template>
        </p>
        <div class="work__criteria">
          <h3>Критерии оценивания</h3>
          <p v-if="work.criteria" class="work__pre">{{ work.criteria }}</p>
          <p v-else class="work__muted">Критерии не указаны.</p>
        </div>
        <div v-if="work.canEdit" class="work__actions">
          <Button
            label="Изменить"
            icon="pi pi-pencil"
            size="small"
            severity="secondary"
            outlined
            @click="openEdit"
          />
          <Button
            label="Удалить"
            icon="pi pi-trash"
            size="small"
            severity="danger"
            text
            @click="deleteOpen = true"
          />
        </div>
      </section>

      <section aria-labelledby="work-compare">
        <h2 id="work-compare" class="work__subtitle">Сравнение групп</h2>
        <p class="work__muted">
          Одинаковое задание и рубрика во всех группах. Статистики считаются по баллам; отметки и
          отсутствие данных показаны отдельно и в расчёт не входят.
        </p>
        <StatsTable caption="Сравнение групп по работе" :rows="statsRows" />
      </section>

      <section aria-labelledby="work-sheet">
        <div class="work__sheet-head">
          <h2 id="work-sheet" class="work__subtitle">Ведомость</h2>
          <div v-if="work.groups.length > 1" class="iot-field">
            <label for="work-sheet-group">Группа</label>
            <Select
              v-model="groupId"
              input-id="work-sheet-group"
              :options="work.groups.map((item) => item.group)"
              option-label="name"
              option-value="id"
            />
          </div>
        </div>
        <ControlSheet v-if="groupId" :work="work" :group-id="groupId" @saved="load" />
      </section>

      <ControlWorkDialog v-model:visible="editOpen" :options="options" :work="work" @saved="load" />
      <ActionDialog
        v-model:visible="deleteOpen"
        title="Удалить контрольную работу?"
        message="Работа будет удалена вместе с результатами всех групп. Действие записывается в журнал аудита."
        confirm-label="Удалить"
        danger
        :busy="deleting"
        :error="deleteError"
        @confirm="remove"
      />
    </template>
  </div>
</template>

<style scoped>
.work {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.work__back {
  align-self: flex-start;
  color: var(--iot-color-heading);
}

.work__card {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding: var(--iot-space-4);
}

.work__kind {
  color: var(--iot-color-heading);
  font-size: 0.875rem;
  font-weight: 600;
}

.work__topic {
  margin: 0;
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}

.work__subtitle {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.125rem;
}

.work__criteria h3 {
  margin: 0 0 var(--iot-space-1);
  font-size: 1rem;
}

.work__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.work__pre {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.work__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.work__sheet-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--iot-space-2);
}
</style>
