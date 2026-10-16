import type { App } from 'vue';
import PrimeVue from 'primevue/config';
import { IotPreset } from '@/theme/preset';

/** Русская локализация встроенных текстов PrimeVue (ТЗ: интерфейс полностью на русском). */
const ruLocale = {
  accept: 'Да',
  reject: 'Нет',
  choose: 'Выбрать',
  upload: 'Загрузить',
  cancel: 'Отмена',
  clear: 'Очистить',
  apply: 'Применить',
  emptyMessage: 'Нет доступных вариантов',
  emptyFilterMessage: 'Ничего не найдено',
  emptySearchMessage: 'Ничего не найдено',
  emptySelectionMessage: 'Ничего не выбрано',
  searchMessage: 'Найдено: {0}',
  selectionMessage: 'Выбрано: {0}',
  passwordPrompt: 'Введите пароль',
  weak: 'Слабый',
  medium: 'Средний',
  strong: 'Надёжный',
  dayNames: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  dayNamesShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  dayNamesMin: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  monthNames: [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ],
  monthNamesShort: [
    'Янв',
    'Фев',
    'Мар',
    'Апр',
    'Май',
    'Июн',
    'Июл',
    'Авг',
    'Сен',
    'Окт',
    'Ноя',
    'Дек',
  ],
  today: 'Сегодня',
  weekHeader: 'Нед',
  firstDayOfWeek: 1,
  dateFormat: 'dd.mm.yy',
  aria: {
    close: 'Закрыть',
    trueLabel: 'Да',
    falseLabel: 'Нет',
    nullLabel: 'Не выбрано',
    showPassword: 'Показать пароль',
    hidePassword: 'Скрыть пароль',
  },
};

export function installPrimeVue(app: App): void {
  app.use(PrimeVue, {
    locale: ruLocale,
    theme: {
      preset: IotPreset,
      // ТЗ п. 6.1 — светлая схема; тёмная тема не предусмотрена.
      options: { darkModeSelector: false },
    },
  });
}
