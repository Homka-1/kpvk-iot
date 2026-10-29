<script setup lang="ts">
import type { AnswerValue, FormQuestion } from '@iot/shared';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import { computed } from 'vue';

/**
 * Вопрос методики с полем ответа по типу (п. 4.4 ТЗ): один вариант, несколько вариантов, шкала
 * Лайкерта, число, короткий текст. Используется в предпросмотре конструктора, при прохождении
 * диагностики студентом и при вводе бумажного бланка.
 */
const props = defineProps<{
  question: FormQuestion;
  /** Номер вопроса в списке (с 1). */
  number: number;
  /** Префикс id полей: несколько форм на странице не должны конфликтовать. */
  idPrefix: string;
  error?: string | null;
  disabled?: boolean;
}>();
const model = defineModel<AnswerValue | undefined>();

const fieldId = computed(() => `${props.idPrefix}-${props.question.key}`);

const likertValues = computed(() => {
  const { minValue: min, maxValue: max } = props.question;
  if (min === null || max === null || max < min || max - min > 10) return [];
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
});

const selected = computed(() => (Array.isArray(model.value) ? model.value : []));

function toggle(optionKey: string, checked: boolean): void {
  const rest = selected.value.filter((key) => key !== optionKey);
  model.value = checked ? [...rest, optionKey] : rest;
}
</script>

<template>
  <fieldset class="question-field" :aria-invalid="error ? 'true' : undefined">
    <legend>
      {{ number }}. {{ question.text || 'Без текста' }}
      <template v-if="question.isRequired">
        <span class="question-field__required" aria-hidden="true">*</span>
        <span class="iot-visually-hidden">(обязательный)</span>
      </template>
    </legend>
    <template v-if="question.type === 'SINGLE_CHOICE'">
      <div v-for="option in question.options" :key="option.key" class="question-field__choice">
        <RadioButton
          v-model="model"
          :input-id="`${fieldId}-${option.key}`"
          :name="fieldId"
          :value="option.key"
          :disabled="disabled"
        />
        <label :for="`${fieldId}-${option.key}`">{{ option.text || 'Без текста' }}</label>
      </div>
    </template>
    <template v-else-if="question.type === 'MULTIPLE_CHOICE'">
      <div v-for="option in question.options" :key="option.key" class="question-field__choice">
        <Checkbox
          :model-value="selected.includes(option.key)"
          :input-id="`${fieldId}-${option.key}`"
          :disabled="disabled"
          binary
          @update:model-value="(checked: boolean) => toggle(option.key, checked)"
        />
        <label :for="`${fieldId}-${option.key}`">{{ option.text || 'Без текста' }}</label>
      </div>
    </template>
    <template v-else-if="question.type === 'LIKERT'">
      <div class="question-field__likert">
        <span v-if="question.minLabel" class="question-field__hint">{{ question.minLabel }}</span>
        <div class="question-field__likert-values">
          <div v-for="value in likertValues" :key="value" class="question-field__choice">
            <RadioButton
              v-model="model"
              :input-id="`${fieldId}-${value}`"
              :name="fieldId"
              :value="value"
              :disabled="disabled"
            />
            <label :for="`${fieldId}-${value}`">{{ value }}</label>
          </div>
        </div>
        <span v-if="question.maxLabel" class="question-field__hint">{{ question.maxLabel }}</span>
      </div>
    </template>
    <template v-else-if="question.type === 'NUMBER'">
      <label :for="fieldId" class="iot-visually-hidden">Ответ</label>
      <InputNumber
        :model-value="typeof model === 'number' ? model : null"
        :input-id="fieldId"
        :max-fraction-digits="3"
        :use-grouping="false"
        :disabled="disabled"
        locale="ru-RU"
        @update:model-value="(value: number | null) => (model = value)"
      />
    </template>
    <template v-else>
      <label :for="fieldId" class="iot-visually-hidden">Ответ</label>
      <InputText
        :id="fieldId"
        :model-value="typeof model === 'string' ? model : ''"
        :disabled="disabled"
        maxlength="500"
        fluid
        @update:model-value="(value) => (model = value ?? null)"
      />
    </template>
    <small v-if="error" class="iot-field-error" role="alert">{{ error }}</small>
  </fieldset>
</template>

<style scoped>
.question-field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  min-width: 0;
  margin: 0;
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
}

.question-field[aria-invalid='true'] {
  border-color: var(--iot-tone-danger-text);
}

.question-field legend {
  padding: 0 var(--iot-space-1);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.question-field__hint {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 400;
}

.question-field__required {
  color: var(--iot-tone-danger-text);
}

.question-field__choice {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.question-field__choice label {
  overflow-wrap: anywhere;
}

.question-field__likert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-3);
}

/* Значения шкалы переносятся только целым блоком: подписи встают отдельной строкой. */
.question-field__likert-values {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  gap: var(--iot-space-3);
  max-width: 100%;
}
</style>
