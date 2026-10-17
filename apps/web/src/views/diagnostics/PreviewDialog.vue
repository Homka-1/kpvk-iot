<script setup lang="ts">
import {
  type AnswerValue,
  answerError,
  type QuestionContent,
  type QuestionnaireContent,
  scoreQuestionnaire,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import { computed, reactive, watch } from 'vue';
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

function likertValues(question: QuestionContent): number[] {
  const { minValue: min, maxValue: max } = question;
  if (min === null || max === null || max < min || max - min > 10) return [];
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function selected(question: QuestionContent): string[] {
  const value = answers[question.key];
  return Array.isArray(value) ? value : [];
}

function toggle(question: QuestionContent, optionKey: string, checked: boolean): void {
  const current = selected(question).filter((key) => key !== optionKey);
  answers[question.key] = checked ? [...current, optionKey] : current;
}

function error(question: QuestionContent): string | null {
  return answerError(question, answers[question.key]);
}
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
          <fieldset class="preview__question">
            <legend>
              {{ index + 1 }}. {{ question.text || 'Без текста' }}
              <span v-if="question.isRequired" class="preview__required">(обязательный)</span>
            </legend>
            <template v-if="question.type === 'SINGLE_CHOICE'">
              <div v-for="option in question.options" :key="option.key" class="preview__choice">
                <RadioButton
                  v-model="answers[question.key]"
                  :input-id="`p-${option.key}`"
                  :name="`p-${question.key}`"
                  :value="option.key"
                />
                <label :for="`p-${option.key}`">{{ option.text || 'Без текста' }}</label>
              </div>
            </template>
            <template v-else-if="question.type === 'MULTIPLE_CHOICE'">
              <div v-for="option in question.options" :key="option.key" class="preview__choice">
                <Checkbox
                  :model-value="selected(question).includes(option.key)"
                  :input-id="`p-${option.key}`"
                  binary
                  @update:model-value="(checked: boolean) => toggle(question, option.key, checked)"
                />
                <label :for="`p-${option.key}`">{{ option.text || 'Без текста' }}</label>
              </div>
            </template>
            <template v-else-if="question.type === 'LIKERT'">
              <div class="preview__likert">
                <span v-if="question.minLabel" class="preview__pole">{{ question.minLabel }}</span>
                <div
                  v-for="value in likertValues(question)"
                  :key="value"
                  class="preview__likert-item"
                >
                  <RadioButton
                    v-model="answers[question.key]"
                    :input-id="`p-${question.key}-${value}`"
                    :name="`p-${question.key}`"
                    :value="value"
                  />
                  <label :for="`p-${question.key}-${value}`">{{ value }}</label>
                </div>
                <span v-if="question.maxLabel" class="preview__pole">{{ question.maxLabel }}</span>
              </div>
            </template>
            <template v-else-if="question.type === 'NUMBER'">
              <label :for="`p-${question.key}`" class="iot-visually-hidden">Ответ</label>
              <InputNumber
                :model-value="(answers[question.key] as number | null) ?? null"
                :input-id="`p-${question.key}`"
                :max-fraction-digits="3"
                :use-grouping="false"
                locale="ru-RU"
                @update:model-value="(value: number | null) => (answers[question.key] = value)"
              />
            </template>
            <template v-else>
              <label :for="`p-${question.key}`" class="iot-visually-hidden">Ответ</label>
              <InputText
                :id="`p-${question.key}`"
                :model-value="(answers[question.key] as string | null) ?? ''"
                maxlength="500"
                fluid
                @update:model-value="(value) => (answers[question.key] = value ?? null)"
              />
            </template>
            <small v-if="error(question)" class="iot-field-error">{{ error(question) }}</small>
          </fieldset>
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

.preview__question {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
}

.preview__question legend {
  padding: 0 var(--iot-space-1);
  font-weight: 600;
}

.preview__required,
.preview__missing,
.preview__pole {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 400;
}

.preview__choice,
.preview__likert-item {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.preview__likert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-3);
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
