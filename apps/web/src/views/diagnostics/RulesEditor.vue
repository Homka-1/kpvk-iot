<script setup lang="ts">
import {
  MOTIVATION_LEVEL_LABELS,
  type MotivationLevel,
  QUESTIONNAIRE_LIMITS,
  type QuestionnaireContent,
  scaleScoreRange,
} from '@iot/shared';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import EmptyState from '@/components/EmptyState.vue';
import { formatScore, moveItem, newRule } from './content';

/**
 * Правила интерпретации: диапазон балла шкалы (границы включительно) → уровень, текст для
 * преподавателя и понятная студенту интерпретация (FR-016). Вклад уровня в мотивационный
 * профиль используется на этапе 09.
 */
defineProps<{ readonly: boolean }>();
const content = defineModel<QuestionnaireContent>('content', { required: true });

const MOTIVATION_OPTIONS = [
  { value: null, label: 'Не влияет на профиль' },
  ...(Object.keys(MOTIVATION_LEVEL_LABELS) as MotivationLevel[]).map((value) => ({
    value,
    label: MOTIVATION_LEVEL_LABELS[value],
  })),
];

function rangeText(index: number): string {
  const range = scaleScoreRange(content.value, content.value.scales[index]!);
  return range
    ? `Возможный балл по ключам: от ${formatScore(range.min)} до ${formatScore(range.max)}.`
    : 'Возможный диапазон балла не определён: проверьте ключи и границы вопросов.';
}
</script>

<template>
  <div class="rules">
    <EmptyState
      v-if="content.scales.length === 0"
      icon="pi pi-sliders-h"
      title="Сначала добавьте шкалы"
      description="Правила интерпретации задаются для каждой шкалы на вкладке «Шкалы и ключи»."
    />
    <section
      v-for="(scale, index) in content.scales"
      :key="scale.key"
      class="iot-card rules__scale"
      :aria-label="`Интерпретация шкалы ${index + 1}`"
    >
      <h3 class="rules__title">
        {{ scale.name || `Шкала ${index + 1}` }} <span class="rules__code">({{ scale.code }})</span>
      </h3>
      <p class="iot-field-hint">
        {{ rangeText(index) }} Балл, не попавший ни в один диапазон, остаётся без уровня.
      </p>
      <p v-if="scale.rules.length === 0" class="iot-field-hint">Правила не заданы.</p>
      <div v-for="(rule, ruleIndex) in scale.rules" :key="rule.key" class="rule">
        <div class="rule__head">
          <h4 class="rule__title">Уровень {{ ruleIndex + 1 }}</h4>
          <div v-if="!readonly" class="rule__tools">
            <Button
              icon="pi pi-arrow-up"
              text
              size="small"
              :disabled="ruleIndex === 0"
              :aria-label="`Переместить уровень ${ruleIndex + 1} выше`"
              @click="moveItem(scale.rules, ruleIndex, -1)"
            />
            <Button
              icon="pi pi-arrow-down"
              text
              size="small"
              :disabled="ruleIndex === scale.rules.length - 1"
              :aria-label="`Переместить уровень ${ruleIndex + 1} ниже`"
              @click="moveItem(scale.rules, ruleIndex, 1)"
            />
            <Button
              icon="pi pi-trash"
              text
              size="small"
              severity="danger"
              :aria-label="`Удалить уровень ${ruleIndex + 1}`"
              @click="scale.rules.splice(ruleIndex, 1)"
            />
          </div>
        </div>
        <div class="rule__grid">
          <div class="iot-field">
            <label :for="`r-${index}-${ruleIndex}-min`">Балл от</label>
            <InputNumber
              v-model="rule.minScore"
              :input-id="`r-${index}-${ruleIndex}-min`"
              :max-fraction-digits="3"
              :use-grouping="false"
              locale="ru-RU"
              placeholder="Без нижней границы"
              :disabled="readonly"
              fluid
            />
          </div>
          <div class="iot-field">
            <label :for="`r-${index}-${ruleIndex}-max`">Балл до</label>
            <InputNumber
              v-model="rule.maxScore"
              :input-id="`r-${index}-${ruleIndex}-max`"
              :max-fraction-digits="3"
              :use-grouping="false"
              locale="ru-RU"
              placeholder="Без верхней границы"
              :disabled="readonly"
              fluid
            />
          </div>
          <div class="iot-field">
            <label :for="`r-${index}-${ruleIndex}-label`">Название уровня</label>
            <InputText
              :id="`r-${index}-${ruleIndex}-label`"
              v-model="rule.levelLabel"
              maxlength="100"
              :disabled="readonly"
              fluid
            />
          </div>
          <div class="iot-field">
            <label :for="`r-${index}-${ruleIndex}-code`">Код уровня</label>
            <InputText
              :id="`r-${index}-${ruleIndex}-code`"
              v-model="rule.levelCode"
              maxlength="30"
              :disabled="readonly"
              fluid
            />
          </div>
          <div class="iot-field">
            <label :for="`r-${index}-${ruleIndex}-motivation`">Вклад в мотивационный профиль</label>
            <Select
              v-model="rule.motivationLevel"
              :input-id="`r-${index}-${ruleIndex}-motivation`"
              :options="MOTIVATION_OPTIONS"
              option-label="label"
              option-value="value"
              :disabled="readonly"
              fluid
            />
          </div>
        </div>
        <div class="iot-field">
          <label :for="`r-${index}-${ruleIndex}-description`"
            >Интерпретация для преподавателя</label
          >
          <Textarea
            :id="`r-${index}-${ruleIndex}-description`"
            v-model="rule.description"
            rows="2"
            maxlength="2000"
            auto-resize
            :disabled="readonly"
            fluid
          />
        </div>
        <div class="iot-field">
          <label :for="`r-${index}-${ruleIndex}-student`">Понятная студенту интерпретация</label>
          <Textarea
            :id="`r-${index}-${ruleIndex}-student`"
            v-model="rule.studentText"
            rows="2"
            maxlength="2000"
            auto-resize
            :disabled="readonly"
            fluid
          />
        </div>
      </div>
      <Button
        v-if="!readonly && scale.rules.length < QUESTIONNAIRE_LIMITS.rulesPerScale"
        label="Добавить уровень"
        icon="pi pi-plus"
        size="small"
        text
        class="rules__add"
        @click="scale.rules.push(newRule())"
      />
    </section>
  </div>
</template>

<style scoped>
.rules {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.rules__scale {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.rules__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1rem;
}

.rules__code {
  color: var(--iot-color-muted);
  font-weight: 400;
}

.rules__add {
  align-self: flex-start;
}

.rule {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding: var(--iot-space-3);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
}

.rule__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rule__title {
  margin: 0;
  font-size: 0.9375rem;
}

.rule__tools {
  display: flex;
}

.rule__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: var(--iot-space-2);
}
</style>
