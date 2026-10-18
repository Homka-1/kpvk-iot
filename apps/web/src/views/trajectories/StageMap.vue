<script setup lang="ts" generic="S extends TrajectoryStageDto">
import {
  DIFFICULTY_LEVEL_LABELS,
  MATERIAL_KIND_LABELS,
  stageDurationDays,
  type TrajectoryStageDto,
} from '@iot/shared';
import { computed, ref, watch } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import ProgressIndicator from '@/components/ProgressIndicator.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import { checkpointBadge, stageBadge } from './content';

/**
 * Карта маршрута (п. 6.4, FR-041): последовательность этапов — название, цель, сроки, статус,
 * % выполнения, количество заданий, контрольная точка. Выбор этапа открывает его содержание.
 * Процент выполнения появится вместе со сдачей заданий (этап 13), до этого — «Нет данных».
 */
const props = withDefaults(
  defineProps<{
    stages: S[];
    currentStageId?: string | null;
    supportMethods?: string | null;
  }>(),
  { currentStageId: null, supportMethods: null },
);

const selectedId = ref<string | null>(null);
watch(
  () => props.stages.map((stage) => stage.id).join(),
  () => {
    if (!props.stages.some((stage) => stage.id === selectedId.value)) {
      selectedId.value = props.currentStageId ?? props.stages[0]?.id ?? null;
    }
  },
  { immediate: true },
);
const selected = computed(() => props.stages.find((stage) => stage.id === selectedId.value));

const period = (start: string | null, end: string | null) =>
  start || end ? `${formatDate(start)} – ${formatDate(end)}` : 'Сроки не заданы';
const dueLabel = (iso: string | null) => (iso ? formatDate(new Date(iso)) : 'срок не задан');
const firstCheckpoint = (stage: TrajectoryStageDto) => stage.checkpoints[0] ?? null;
</script>

<template>
  <EmptyState
    v-if="stages.length === 0"
    icon="pi pi-map"
    title="Этапов пока нет"
    description="Добавьте этапы маршрута — они появятся на карте."
  />
  <div v-else class="stage-map">
    <ol class="stage-map__list" aria-label="Этапы маршрута">
      <li
        v-for="(stage, index) in stages"
        :key="stage.id"
        class="stage-map__item"
        :class="{
          'stage-map__item--current': stage.id === currentStageId,
          'stage-map__item--selected': stage.id === selectedId,
        }"
      >
        <button
          type="button"
          class="stage-map__card"
          :aria-pressed="stage.id === selectedId"
          :aria-label="`Этап ${index + 1}: ${stage.title}. Показать содержание`"
          @click="selectedId = stage.id"
        >
          <span class="stage-map__number" aria-hidden="true">{{ index + 1 }}</span>
          <span class="stage-map__title">{{ stage.title || 'Без названия' }}</span>
          <StatusBadge
            v-if="stage.id === currentStageId"
            label="Текущий этап"
            tone="info"
            icon="pi pi-map-marker"
          />
          <span class="stage-map__goal">{{ stage.goal || 'Цель не указана' }}</span>
          <span class="stage-map__meta">
            <i class="pi pi-calendar" aria-hidden="true" />
            {{ period(stage.startDate, stage.endDate) }}
          </span>
          <StatusBadge v-bind="stageBadge(stage.status)" />
          <ProgressIndicator label="Выполнение" :value="null" />
          <span class="stage-map__meta">
            <i class="pi pi-file-edit" aria-hidden="true" /> Заданий: {{ stage.assignments.length }}
          </span>
          <span class="stage-map__meta">
            <i class="pi pi-flag" aria-hidden="true" />
            <template v-if="firstCheckpoint(stage)">
              КТ: {{ formatDate(firstCheckpoint(stage)!.dueDate) }}
            </template>
            <template v-else>Контрольная точка не задана</template>
          </span>
        </button>
      </li>
    </ol>

    <section
      v-if="selected"
      class="iot-card stage-map__details"
      :aria-label="`Содержание этапа ${selected.sortOrder + 1}`"
    >
      <h3>Этап {{ selected.sortOrder + 1 }} — {{ selected.title }}</h3>
      <dl class="stage-map__facts">
        <div>
          <dt>Цель</dt>
          <dd>{{ selected.goal || 'Не указана' }}</dd>
        </div>
        <div>
          <dt>Сроки</dt>
          <dd>
            {{ period(selected.startDate, selected.endDate) }}
            <template v-if="stageDurationDays(selected.startDate, selected.endDate)">
              ({{ stageDurationDays(selected.startDate, selected.endDate) }} дн.)
            </template>
          </dd>
        </div>
        <div v-if="selected.description">
          <dt>Содержание</dt>
          <dd class="stage-map__text">{{ selected.description }}</dd>
        </div>
        <div>
          <dt>Планируемые результаты</dt>
          <dd class="stage-map__text">{{ selected.plannedResults || 'Не указаны' }}</dd>
        </div>
      </dl>

      <h4>Материалы</h4>
      <ul v-if="selected.materials.length" class="stage-map__rows">
        <li v-for="material in selected.materials" :key="material.id">
          <slot name="material" :material="material as S['materials'][number]">
            {{ material.title }}
          </slot>
          <span class="stage-map__muted">· {{ MATERIAL_KIND_LABELS[material.kind] }}</span>
          <StatusBadge v-if="material.archived" label="В архиве" tone="neutral" icon="pi pi-box" />
        </li>
      </ul>
      <p v-else class="stage-map__muted">Материалы не назначены</p>

      <h4>Задания</h4>
      <ul v-if="selected.assignments.length" class="stage-map__rows">
        <li v-for="item in selected.assignments" :key="item.id">
          <slot name="assignment" :item="item">{{ item.assignment.title }}</slot>
          <span class="stage-map__muted">
            · {{ item.assignment.typeName }} · сложность:
            {{ DIFFICULTY_LEVEL_LABELS[item.assignment.difficulty].toLowerCase() }} · срок:
            {{ dueLabel(item.dueAt) }}
          </span>
        </li>
      </ul>
      <p v-else class="stage-map__muted">Задания не назначены</p>

      <h4>Контрольные точки</h4>
      <ul v-if="selected.checkpoints.length" class="stage-map__rows">
        <li v-for="checkpoint in selected.checkpoints" :key="checkpoint.id">
          {{ checkpoint.title }}
          <span class="stage-map__muted">· {{ formatDate(checkpoint.dueDate) }}</span>
          <StatusBadge v-bind="checkpointBadge(checkpoint.status)" />
          <span v-if="checkpoint.description" class="stage-map__text stage-map__muted">
            {{ checkpoint.description }}
          </span>
        </li>
      </ul>
      <p v-else class="stage-map__muted">Контрольные точки не заданы</p>

      <template v-if="supportMethods">
        <h4>Способы сопровождения</h4>
        <p class="stage-map__text">{{ supportMethods }}</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.stage-map {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.stage-map__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.stage-map__item {
  position: relative;
  display: flex;
}

.stage-map__card {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-2);
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
  background: var(--iot-color-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.stage-map__card:hover {
  border-color: var(--iot-navy-100);
}

.stage-map__item--current .stage-map__card {
  border: 2px solid var(--iot-navy-700);
}

.stage-map__item--selected .stage-map__card {
  background: var(--iot-color-info-bg);
}

.stage-map__card :deep(.progress-indicator) {
  width: 100%;
}

.stage-map__number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--iot-navy-700);
  color: var(--iot-color-on-primary);
  font-weight: 700;
}

.stage-map__title {
  color: var(--iot-color-heading);
  font-weight: 700;
}

.stage-map__goal,
.stage-map__meta,
.stage-map__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.stage-map__meta {
  display: inline-flex;
  gap: var(--iot-space-1);
  align-items: center;
}

.stage-map__details h3 {
  font-size: 1.0625rem;
}

.stage-map__details h4 {
  margin: var(--iot-space-3) 0 var(--iot-space-1);
  font-size: 0.9375rem;
}

.stage-map__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
}

.stage-map__facts dt {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.stage-map__facts dd {
  margin: 0;
}

.stage-map__text {
  white-space: pre-line;
}

.stage-map__rows {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding-left: var(--iot-space-4);
}

.stage-map__rows li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-1) var(--iot-space-2);
  align-items: center;
}

/* На смартфоне — вертикальный список этапов со связующей линией слева (макет, экран 3). */
@media (max-width: 640px) {
  .stage-map__list {
    grid-template-columns: 1fr;
    padding-left: var(--iot-space-4);
    border-left: 2px solid var(--iot-navy-100);
  }
}

@media (min-width: 641px) {
  .stage-map__item:not(:last-child)::after {
    position: absolute;
    top: 22px;
    right: calc(-1 * var(--iot-space-3));
    width: var(--iot-space-3);
    border-top: 2px solid var(--iot-navy-100);
    content: '';
  }
}
</style>
