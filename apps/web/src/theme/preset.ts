import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Тема PrimeVue по ТЗ, п. 6.1: академический стиль, светлая схема, тёмно-синий основной цвет.
 * Палитра совпадает с токенами `--iot-navy-*` в `tokens.css` (см. docs/design/tokens.md).
 */
export const IotPreset = definePreset(Aura, {
  primitive: {
    navy: {
      50: '#eef3fa',
      100: '#d6e2f3',
      200: '#adc5e6',
      300: '#7fa2d3',
      400: '#5280bd',
      500: '#2f62a4',
      600: '#234f8a',
      700: '#1c3f70',
      800: '#163259',
      900: '#102543',
      950: '#0a182c',
    },
  },
  semantic: {
    primary: {
      50: '{navy.50}',
      100: '{navy.100}',
      200: '{navy.200}',
      300: '{navy.300}',
      400: '{navy.400}',
      500: '{navy.500}',
      600: '{navy.600}',
      700: '{navy.700}',
      800: '{navy.800}',
      900: '{navy.900}',
      950: '{navy.950}',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.700}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.800}',
          focusColor: '{primary.900}',
        },
      },
    },
  },
});
