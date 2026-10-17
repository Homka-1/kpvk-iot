<script setup lang="ts">
import {
  type AnswerValue,
  answerError,
  type QuestionnaireContent,
  scoreQuestionnaire,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { computed, reactive, watch } from 'vue';
import QuestionField from '@/components/QuestionField.vue';
import { formatScore } from './content';

/**
 * Предпросмотр методики: вопросы так, как их увидит студент, и расчёт баллов по введённым
 * ответам тем же движком, что и на сервере. Ответы предпросмотра никуда не сохраняются.
 */
const props = defineProps<{ content: QuestionnaireContent }>();
const visible = defineModel<boolean>('visible', { required: true });
const answers = reactive<Record<string, AnswerValue>>({});

watch(visible, (open) => {
  if (open) for (const key of Object.keys(answers)) delete answers[key];
});

const scores = computed(() => scoreQuestionnaire(props.content, answers));
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Предпросмотр методики"
    :style="{ width: '48rem' }"
    :breakpoints="{ '800px': '95vw' }"
  >
    <div class="preview">
      <p class="preview__note" role="note">
        <i class="pi pi-info-circle" aria-hidden="true" /> Ответы предпросмотра не сохраняются.
        Используйте их, чтобы проверить ключи и интерпретацию.
      </p>
      <h2 class="preview__title">{{ content.title }}</h2>
      <p v-if="content.instruction" class="preview__instruction">{{ content.instruction }}</p>

      <ol class="preview__questions">
        <li v-for="(question, index) in content.questions" :key="question.key">
          <QuestionField
            v-model="answers[question.key]"
            :question="question"
            :number="index + 1"
            id-prefix="preview"
            :error="answerError(question, answers[question.key])"
          />
        </li>
      </ol>

      <section class="preview__scores" aria-labelledby="preview-scores">
        <h3 id="preview-scores">Расчёт по шкалам</h3>
        <p v-if="scores.length === 0" class="iot-field-hint">Шкалы не заданы.</p>
        <table v-else class="preview__table">
          <thead>
            <tr>
              <th scope="col">Шкала</th>
              <th scope="col">Балл</th>
              <th scope="col">Уровень</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="score in scores" :key="score.scaleKey">
              <td>{{ score.name || score.code }}</td>
              <td>
                {{ formatScore(score.rawScore) }}
                <span v-if="score.missingAnswers > 0" class="preview__missing">
                  (без ответа: {{ score.missingAnswers }})
                </span>
              </td>
              <td>
                {{ score.rule?.levelLabel ?? (score.rawScore === null ? '—' : 'Не определён') }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <div class="iot-form-buttons">
        <Button label="Закрыть" severity="secondary" @click="visible = false" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.preview p {
  margin: 0;
}

.preview__note {
  padding: var(--iot-space-2) var(--iot-space-3);
  border: 1px solid var(--iot-color-info-border);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-info-text);
}

.preview__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1.125rem;
}

.preview__instruction {
  white-space: pre-line;
}

.preview__questions {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.preview__missing {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 400;
}

.preview__scores h3 {
  margin: 0 0 var(--iot-space-2);
  color: var(--iot-color-heading);
  font-size: 1rem;
}

.preview__table {
  width: 100%;
  border-collapse: collapse;
}

.preview__table th,
.preview__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
}
</style>
