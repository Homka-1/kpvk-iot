<script setup lang="ts">
import type { ScaleResultDto } from '@iot/shared';
import { formatScore } from './content';

/** Баллы по шкалам: пропуск — «Нет данных», а не ноль (FR-074). */
defineProps<{ scores: ScaleResultDto[]; caption: string }>();
</script>

<template>
  <div class="scores">
    <p v-if="scores.length === 0" class="scores__empty">Нет данных</p>
    <table v-else class="scores__table" :aria-label="caption">
      <thead>
        <tr>
          <th scope="col">Шкала</th>
          <th scope="col">Балл</th>
          <th scope="col">Уровень</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="score in scores" :key="score.scaleId">
          <td>{{ score.name || score.code }}</td>
          <td>
            {{ formatScore(score.rawScore) }}
            <span v-if="score.missingAnswers > 0" class="scores__muted">
              (без ответа: {{ score.missingAnswers }})
            </span>
          </td>
          <td>
            {{ score.level?.label ?? (score.rawScore === null ? 'Нет данных' : 'Не определён') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.scores {
  overflow-x: auto;
}

.scores__empty,
.scores__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.scores__table {
  width: 100%;
  border-collapse: collapse;
}

.scores__table th,
.scores__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
  vertical-align: top;
}

.scores__table th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}
</style>
