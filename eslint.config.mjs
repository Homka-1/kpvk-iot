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
    files: ['apps/api/prisma/seed.ts', 'apps/api/prisma/erd.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
