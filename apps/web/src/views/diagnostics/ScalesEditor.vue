<script setup lang="ts">
import {
  isChoiceQuestion,
  QUESTIONNAIRE_LIMITS,
  type QuestionnaireContent,
  SCALE_AGGREGATION_LABELS,
  SCALE_MEAN_DECIMALS,
  ScaleAggregation,
  type ScaleContent,
  SCALE_MOTIVATION_ROLE_LABELS,
  ScaleMotivationRole,
  type ScoringKeyContent,
  scaleScoreRange,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { computed } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import { formatScore, newScale, questionLabel } from './content';

/**
 * Шкалы и ключи начисления баллов (FR-021): несколько шкал, ключ на весь вопрос (с обратным
 * кодированием) или на отдельный вариант ответа, вес ключа, способ расчёта балла шкалы.
 */
defineProps<{ readonly: boolean }>();
const content = defineModel<QuestionnaireContent>('content', { required: true });

/** Вопросы, которые можно связать со шкалой: текстовый ответ баллов не даёт. */
const questionOptions = computed(() =>
  content.value.questions
    .filter((question) => question.type !== 'SHORT_TEXT')
    .map((question) => ({
      value: question.key,
      label: questionLabel(content.value, question.key),
    })),
);

function question(key: ScoringKeyContent) {
  return content.value.questions.find((item) => item.key === key.questionKey);
}

function optionChoices(key: ScoringKeyContent) {
  const target = question(key);
  if (!target || !isChoiceQuestion(target.type)) return [];
  return [
    { value: null, label: 'Весь вопрос (значение ответа)' },
    ...target.options.map((option, index) => ({
      value: option.key,
      label: `Вариант ${index + 1}: ${option.text.trim() || 'без текста'}`,
    })),
  ];
}

/** Обратное кодирование возможно для ключа на весь вопрос, кроме вопроса с несколькими вариантами. */
function canReverse(key: ScoringKeyContent): boolean {
  return key.optionKey === null && question(key)?.type !== 'MULTIPLE_CHOICE';
}

function setQuestion(key: ScoringKeyContent, questionKey: string): void {
  key.questionKey = questionKey;
  key.optionKey = null;
  key.points = null;
}

function setOption(key: ScoringKeyContent, optionKey: string | null): void {
  key.optionKey = optionKey;
  if (optionKey === null) key.points = null;
  else key.isReverse = false;
}

function addKey(scale: ScaleContent): void {
  const first = questionOptions.value[0];
  if (!first) return;
  scale.keys.push({
    questionKey: first.value,
    optionKey: null,
    points: null,
    isReverse: false,
    weight: 1,
  });
}

const aggregationOptions = Object.values(ScaleAggregation).map((value) => ({
  value,
  label: SCALE_AGGREGATION_LABELS[value],
}));

function aggregationHint(scale: ScaleContent): string {
  return scale.aggregation === ScaleAggregation.MEAN
    ? `Сумма баллов делится на число вопросов шкалы и округляется до ${SCALE_MEAN_DECIMALS} знака после запятой.`
    : 'Баллы по всем ключам шкалы складываются.';
}

const roleOptions = Object.values(ScaleMotivationRole).map((value) => ({
  value,
  label: SCALE_MOTIVATION_ROLE_LABELS[value],
}));

const ROLE_HINTS: Record<ScaleMotivationRole, string> = {
  INTRINSIC: 'Определяет уровень методики в мотивационном профиле.',
  EXTRINSIC:
    'Уровень не повышает; если внешняя мотивация выше внутренней, преподаватель увидит предупреждение.',
  REFERENCE: 'В мотивационном профиле не участвует.',
};

function rangeText(scale: ScaleContent): string | null {
  const range = scaleScoreRange(content.value, scale);
  return range && scale.keys.length > 0
    ? `Возможный балл: от ${formatScore(range.min)} до ${formatScore(range.max)}`
    : null;
}
</script>

<template>
  <div class="scales">
    <EmptyState
      v-if="content.scales.length === 0"
      icon="pi pi-sliders-h"
      title="Шкал пока нет"
      :description="
        readonly
          ? 'В этой версии нет шкал.'
          : 'Добавьте шкалу и укажите, какие вопросы и варианты дают баллы по ней.'
      "
    />
    <section
      v-for="(scale, index) in content.scales"
      :key="scale.key"
      class="iot-card scale"
      :aria-label="`Шкала ${index + 1}`"
    >
      <div class="scale__head">
        <h3 class="scale__title">Шкала {{ index + 1 }}{{ scale.name ? `: ${scale.name}` : '' }}</h3>
        <Button
          v-if="!readonly"
          icon="pi pi-trash"
          text
          size="small"
          severity="danger"
          :aria-label="`Удалить шкалу ${index + 1}`"
          @click="content.scales.splice(index, 1)"
        />
      </div>
      <div class="scale__row">
        <div class="iot-field">
          <label :for="`s-${index}-name`">Название</label>
          <InputText
            :id="`s-${index}-name`"
            v-model="scale.name"
            maxlength="200"
            :disabled="readonly"
            fluid
          />
        </div>
        <div class="iot-field">
          <label :for="`s-${index}-code`">Код (латиница)</label>
          <InputText
            :id="`s-${index}-code`"
            :model-value="scale.code"
            maxlength="30"
            :disabled="readonly"
            fluid
            @update:model-value="(value) => (scale.code = (value ?? '').toUpperCase())"
          />
        </div>
        <div class="iot-field">
          <label :for="`s-${index}-aggregation`">Способ расчёта</label>
          <Select
            v-model="scale.aggregation"
            :input-id="`s-${index}-aggregation`"
            :options="aggregationOptions"
            option-label="label"
            option-value="value"
            :disabled="readonly"
            :aria-describedby="`s-${index}-aggregation-hint`"
            fluid
          />
          <small :id="`s-${index}-aggregation-hint`" class="iot-field-hint">
            {{ aggregationHint(scale) }}
          </small>
        </div>
        <div class="iot-field">
          <label :for="`s-${index}-role`">Роль в мотивационном профиле</label>
          <Select
            v-model="scale.motivationRole"
            :input-id="`s-${index}-role`"
            :options="roleOptions"
            option-label="label"
            option-value="value"
            :disabled="readonly"
            :aria-describedby="`s-${index}-role-hint`"
            fluid
          />
          <small :id="`s-${index}-role-hint`" class="iot-field-hint">
            {{ ROLE_HINTS[scale.motivationRole] }}
          </small>
        </div>
      </div>
      <div class="iot-field">
        <label :for="`s-${index}-description`">Описание</label>
        <Textarea
          :id="`s-${index}-description`"
          v-model="scale.description"
          rows="2"
          maxlength="2000"
          auto-resize
          :disabled="readonly"
          fluid
        />
      </div>

      <fieldset class="scale__keys">
        <legend>Ключи начисления баллов</legend>
        <p v-if="scale.keys.length === 0" class="iot-field-hint">Ключи не заданы.</p>
        <div v-for="(key, keyIndex) in scale.keys" :key="keyIndex" class="scale-key">
          <div class="iot-field scale-key__question">
            <label :for="`s-${index}-k-${keyIndex}-q`">Вопрос</label>
            <Select
              :model-value="key.questionKey"
              :input-id="`s-${index}-k-${keyIndex}-q`"
              :options="questionOptions"
              option-label="label"
              option-value="value"
              :disabled="readonly"
              fluid
              @update:model-value="(value: string) => setQuestion(key, value)"
            />
          </div>
          <div v-if="optionChoices(key).length > 0" class="iot-field scale-key__option">
            <label :for="`s-${index}-k-${keyIndex}-o`">Что учитывать</label>
            <Select
              :model-value="key.optionKey"
              :input-id="`s-${index}-k-${keyIndex}-o`"
              :options="optionChoices(key)"
              option-label="label"
              option-value="value"
              :disabled="readonly"
              fluid
              @update:model-value="(value: string | null) => setOption(key, value)"
            />
          </div>
          <div v-if="key.optionKey !== null" class="iot-field scale-key__number">
            <label :for="`s-${index}-k-${keyIndex}-p`">Баллы</label>
            <InputNumber
              v-model="key.points"
              :input-id="`s-${index}-k-${keyIndex}-p`"
              :max-fraction-digits="3"
              :use-grouping="false"
              locale="ru-RU"
              placeholder="Значение варианта"
              :disabled="readonly"
              fluid
            />
          </div>
          <div class="iot-field scale-key__number">
            <label :for="`s-${index}-k-${keyIndex}-w`">Вес</label>
            <InputNumber
              v-model="key.weight"
              :input-id="`s-${index}-k-${keyIndex}-w`"
              :max-fraction-digits="3"
              :use-grouping="false"
              locale="ru-RU"
              :disabled="readonly"
              fluid
            />
          </div>
          <div v-if="canReverse(key)" class="scale-key__check">
            <Checkbox
              v-model="key.isReverse"
              :input-id="`s-${index}-k-${keyIndex}-r`"
              binary
              :disabled="readonly"
            />
            <label :for="`s-${index}-k-${keyIndex}-r`">Обратный ключ</label>
          </div>
          <Button
            v-if="!readonly"
            icon="pi pi-times"
            text
            size="small"
            severity="danger"
            :aria-label="`Удалить ключ ${keyIndex + 1} шкалы ${index + 1}`"
            @click="scale.keys.splice(keyIndex, 1)"
          />
        </div>
        <Button
          v-if="!readonly && scale.keys.length < QUESTIONNAIRE_LIMITS.keysPerScale"
          label="Добавить ключ"
          icon="pi pi-plus"
          size="small"
          text
          :disabled="questionOptions.length === 0"
          @click="addKey(scale)"
        />
        <p v-if="!readonly && questionOptions.length === 0" class="iot-field-hint">
          Сначала добавьте вопросы, дающие баллы.
        </p>
        <p v-if="rangeText(scale)" class="iot-field-hint">{{ rangeText(scale) }}</p>
      </fieldset>
    </section>
    <Button
      v-if="!readonly && content.scales.length < QUESTIONNAIRE_LIMITS.scales"
      label="Добавить шкалу"
      icon="pi pi-plus"
      severity="secondary"
      class="scales__add"
      @click="content.scales.push(newScale(content.scales.length))"
    />
  </div>
</template>

<style scoped>
.scales {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.scales__add {
  align-self: flex-start;
}

.scale {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.scale__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.scale__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1rem;
}

.scale__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--iot-space-3);
}

.scale__keys {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
}

.scale__keys legend {
  padding: 0 var(--iot-space-1);
  font-weight: 600;
}

.scale-key {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--iot-space-2);
  padding-bottom: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
}

.scale-key__question {
  flex: 2 1 240px;
  min-width: 0;
}

.scale-key__option {
  flex: 2 1 200px;
  min-width: 0;
}

.scale-key__number {
  flex: 0 1 7rem;
}

.scale-key__check {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
  min-height: 2.5rem;
}
</style>
