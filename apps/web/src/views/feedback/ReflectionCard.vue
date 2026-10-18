<script setup lang="ts">
import { type ReflectionDto, SELF_ASSESSMENT_MAX } from '@iot/shared';
import { formatDateTime } from '@/utils/format';
import { NO_DATA } from '@/views/students/labels';

/** Рефлексия студента после контрольной точки или в ответ на запрос самооценки (FR-066). */
defineProps<{ item: ReflectionDto }>();
</script>

<template>
  <article class="reflection iot-card" aria-label="Рефлексия">
    <div class="reflection__head">
      <i class="pi pi-compass" aria-hidden="true" />
      <strong>
        Рефлексия{{ item.checkpoint ? ` после контрольной точки «${item.checkpoint.title}»` : '' }}
      </strong>
    </div>
    <p class="reflection__meta">
      {{ formatDateTime(item.createdAt) }}
      <template v-if="item.trajectory"> · ИОТ: {{ item.trajectory.disciplineName }}</template>
      <template v-if="item.stage">
        · этап {{ item.stage.sortOrder + 1 }}. {{ item.stage.title }}</template
      >
    </p>
    <dl class="reflection__facts">
      <dt>Самооценка</dt>
      <dd>
        {{
          item.selfAssessment !== null
            ? `${item.selfAssessment} из ${SELF_ASSESSMENT_MAX}`
            : NO_DATA
        }}
      </dd>
      <template v-if="item.achievements">
        <dt>Что получилось</dt>
        <dd>{{ item.achievements }}</dd>
      </template>
      <template v-if="item.difficulties">
        <dt>Что было трудно</dt>
        <dd>{{ item.difficulties }}</dd>
      </template>
      <template v-if="item.nextSteps">
        <dt>Что дальше</dt>
        <dd>{{ item.nextSteps }}</dd>
      </template>
    </dl>
  </article>
</template>

<style scoped>
.reflection {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.reflection__head {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.reflection__head .pi {
  color: var(--iot-navy-700);
}

.reflection__meta {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.reflection__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--iot-space-1) var(--iot-space-3);
  margin: 0;
}

.reflection__facts dt {
  color: var(--iot-color-muted);
}

.reflection__facts dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 479px) {
  .reflection__facts {
    grid-template-columns: 1fr;
  }
}
</style>
