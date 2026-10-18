<script setup lang="ts">
import DatePicker from 'primevue/datepicker';
import { computed } from 'vue';

/**
 * Поле даты в формате «дд/мм/гггг» независимо от языка браузера (нативное поле даты в браузере
 * с английским интерфейсом показывает «мм/дд/гггг»). Значение — строка `YYYY-MM-DD`, как в API;
 * пустое поле — пустая строка. Дату можно ввести с клавиатуры или выбрать в календаре (кнопка).
 */
const model = defineModel<string>({ default: '' });
const props = withDefaults(
  defineProps<{
    inputId: string;
    invalid?: boolean;
    fluid?: boolean;
    /** Самая поздняя допустимая дата `YYYY-MM-DD`. */
    max?: string;
  }>(),
  { invalid: false, fluid: false, max: undefined },
);

const pad = (value: number) => String(value).padStart(2, '0');

function parse(value: string | undefined): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

const date = computed({
  get: () => parse(model.value),
  set: (value: Date | Date[] | (Date | null)[] | null | undefined) => {
    const day = value instanceof Date ? value : null;
    model.value = day
      ? `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
      : '';
  },
});
const maxDate = computed(() => parse(props.max) ?? undefined);
</script>

<template>
  <DatePicker
    v-model="date"
    :input-id="inputId"
    date-format="dd/mm/yy"
    placeholder="дд/мм/гггг"
    :max-date="maxDate"
    :invalid="invalid"
    :fluid="fluid"
    :show-on-focus="false"
    show-icon
    icon-display="button"
    show-button-bar
  />
</template>
