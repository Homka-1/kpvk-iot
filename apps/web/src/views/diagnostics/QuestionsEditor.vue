<script setup lang="ts">
import {
  isChoiceQuestion,
  QUESTION_TYPE_LABELS,
  QUESTIONNAIRE_LIMITS,
  type QuestionContent,
  type QuestionnaireContent,
  type QuestionType,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import EmptyState from '@/components/EmptyState.vue';
import {
  changeQuestionType,
  moveItem,
  newKey,
  newQuestion,
  QUESTION_TYPE_OPTIONS,
  removeOption,
  removeQuestion,
} from './content';

/** Вопросы методики: пять типов п. 4.4 ТЗ, варианты ответа и границы шкал. */
defineProps<{ readonly: boolean }>();
const content = defineModel<QuestionnaireContent>('content', { required: true });

function add(): void {
  content.value.questions.push(newQuestion());
}

function setType(question: QuestionContent, type: QuestionType): void {
  changeQuestionType(content.value, question, type);
}

function addOption(question: QuestionContent): void {
  question.options.push({ key: newKey(), text: '', value: question.options.length });
}
</script>

<template>
  <div class="questions">
    <EmptyState
      v-if="content.questions.length === 0"
      icon="pi pi-question-circle"
      title="Вопросов пока нет"
      :description="
        readonly
          ? 'В этой версии нет вопросов.'
          : 'Добавьте вопросы. Типы: один вариант, несколько вариантов, шкала Лайкерта, числовой ответ, короткий текст.'
      "
    />
    <ol v-else class="questions__list">
      <li
        v-for="(question, index) in content.questions"
        :key="question.key"
        class="iot-card question"
      >
        <div class="question__head">
          <h3 class="question__number">Вопрос {{ index + 1 }}</h3>
          <div v-if="!readonly" class="question__tools">
            <Button
              icon="pi pi-arrow-up"
              text
              size="small"
              :disabled="index === 0"
              :aria-label="`Переместить вопрос ${index + 1} выше`"
              @click="moveItem(content.questions, index, -1)"
            />
            <Button
              icon="pi pi-arrow-down"
              text
              size="small"
              :disabled="index === content.questions.length - 1"
              :aria-label="`Переместить вопрос ${index + 1} ниже`"
              @click="moveItem(content.questions, index, 1)"
            />
            <Button
              icon="pi pi-trash"
              text
              size="small"
              severity="danger"
              :aria-label="`Удалить вопрос ${index + 1}`"
              @click="removeQuestion(content, index)"
            />
          </div>
        </div>

        <div class="iot-field">
          <label :for="`q-${index}-text`">Текст вопроса</label>
          <Textarea
            :id="`q-${index}-text`"
            v-model="question.text"
            rows="2"
            maxlength="2000"
            auto-resize
            :disabled="readonly"
            fluid
          />
        </div>
        <div class="question__row">
          <div class="iot-field question__type">
            <label :for="`q-${index}-type`">Тип ответа</label>
            <Select
              :model-value="question.type"
              :input-id="`q-${index}-type`"
              :options="QUESTION_TYPE_OPTIONS"
              option-label="label"
              option-value="value"
              :disabled="readonly"
              fluid
              @update:model-value="(type: QuestionType) => setType(question, type)"
            />
          </div>
          <div class="question__check">
            <Checkbox
              v-model="question.isRequired"
              :input-id="`q-${index}-required`"
              binary
              :disabled="readonly"
            />
            <label :for="`q-${index}-required`">Обязательный</label>
          </div>
        </div>

        <div v-if="question.type === 'LIKERT' || question.type === 'NUMBER'" class="question__row">
          <div class="iot-field">
            <label :for="`q-${index}-min`">Минимум</label>
            <InputNumber
              v-model="question.minValue"
              :input-id="`q-${index}-min`"
              :max-fraction-digits="question.type === 'LIKERT' ? 0 : 3"
              :use-grouping="false"
              locale="ru-RU"
              :disabled="readonly"
              fluid
            />
          </div>
          <div class="iot-field">
            <label :for="`q-${index}-max`">Максимум</label>
            <InputNumber
              v-model="question.maxValue"
              :input-id="`q-${index}-max`"
              :max-fraction-digits="question.type === 'LIKERT' ? 0 : 3"
              :use-grouping="false"
              locale="ru-RU"
              :disabled="readonly"
              fluid
            />
          </div>
        </div>
        <p v-if="question.type === 'NUMBER'" class="iot-field-hint">
          Границы числового ответа необязательны; для обратного кодирования нужны обе.
        </p>
        <div v-if="question.type === 'LIKERT'" class="question__row">
          <div class="iot-field">
            <label :for="`q-${index}-min-label`">Подпись минимума</label>
            <InputText
              :id="`q-${index}-min-label`"
              v-model="question.minLabel"
              maxlength="100"
              :disabled="readonly"
              fluid
            />
          </div>
          <div class="iot-field">
            <label :for="`q-${index}-max-label`">Подпись максимума</label>
            <InputText
              :id="`q-${index}-max-label`"
              v-model="question.maxLabel"
              maxlength="100"
              :disabled="readonly"
              fluid
            />
          </div>
        </div>

        <fieldset v-if="isChoiceQuestion(question.type)" class="question__options">
          <legend>Варианты ответа</legend>
          <div
            v-for="(option, optionIndex) in question.options"
            :key="option.key"
            class="question__option"
          >
            <div class="iot-field question__option-text">
              <label :for="`q-${index}-o-${optionIndex}-text`">Вариант {{ optionIndex + 1 }}</label>
              <InputText
                :id="`q-${index}-o-${optionIndex}-text`"
                v-model="option.text"
                maxlength="500"
                :disabled="readonly"
                fluid
              />
            </div>
            <div class="iot-field question__option-value">
              <label :for="`q-${index}-o-${optionIndex}-value`">Значение</label>
              <InputNumber
                v-model="option.value"
                :input-id="`q-${index}-o-${optionIndex}-value`"
                :max-fraction-digits="3"
                :use-grouping="false"
                locale="ru-RU"
                :disabled="readonly"
                fluid
              />
            </div>
            <Button
              v-if="!readonly"
              icon="pi pi-times"
              text
              size="small"
              severity="danger"
              class="question__option-remove"
              :aria-label="`Удалить вариант ${optionIndex + 1} вопроса ${index + 1}`"
              @click="removeOption(content, question, optionIndex)"
            />
          </div>
          <Button
            v-if="!readonly && question.options.length < QUESTIONNAIRE_LIMITS.optionsPerQuestion"
            label="Добавить вариант"
            icon="pi pi-plus"
            size="small"
            text
            @click="addOption(question)"
          />
        </fieldset>
        <p v-if="question.type === 'SHORT_TEXT'" class="iot-field-hint">
          {{ QUESTION_TYPE_LABELS.SHORT_TEXT }} сохраняется, но не участвует в подсчёте баллов.
        </p>
      </li>
    </ol>
    <Button
      v-if="!readonly && content.questions.length < QUESTIONNAIRE_LIMITS.questions"
      label="Добавить вопрос"
      icon="pi pi-plus"
      severity="secondary"
      class="questions__add"
      @click="add"
    />
  </div>
</template>

<style scoped>
.questions {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.questions__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.questions__add {
  align-self: flex-start;
}

.question {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.question__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.question__number {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1rem;
}

.question__tools {
  display: flex;
}

.question__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  align-items: end;
  gap: var(--iot-space-3);
}

.question__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
  min-height: 2.5rem;
}

.question__options {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
}

.question__options legend {
  padding: 0 var(--iot-space-1);
  font-weight: 600;
}

.question__option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 7rem auto;
  align-items: end;
  gap: var(--iot-space-2);
}

@media (max-width: 575px) {
  .question__option {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .question__option-text {
    grid-column: 1 / -1;
  }
}
</style>
