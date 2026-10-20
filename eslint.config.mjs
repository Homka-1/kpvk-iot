import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/src/generated/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/web/src/**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Защита от XSS (п. 8.3): пользовательский текст выводится только интерполяцией Vue,
      // которая экранирует HTML. Вставка сырого HTML запрещена.
      'vue/no-v-html': 'error',
      'no-restricted-properties': [
        'error',
        { object: 'document', property: 'write', message: 'Запрещено: риск XSS (п. 8.3).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]:not([right.type='Literal'])",
          message: 'Запрещено: вставка HTML из данных — риск XSS (п. 8.3).',
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      // NestJS использует классы-модули без тела и внедрение зависимостей через конструктор.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: [
      'apps/api/prisma/seed.ts',
      'apps/api/prisma/erd.ts',
      'apps/api/src/cli/*.ts',
      'docker/test/*.mts',
      'apps/api/test/load/*.ts',
      'apps/web/e2e/acceptance/support/stand.ts',
      'scripts/*.mjs',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    // Сценарии k6 выполняются не в Node, а в среде k6 со своими глобальными объектами.
    files: ['**/*.k6.js'],
    languageOptions: {
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly', open: 'readonly' },
    },
  },
  prettier,
);
