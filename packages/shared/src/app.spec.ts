import { describe, expect, it } from 'vitest';
import { API_PREFIX, APP_SHORT_NAME } from './index.js';

describe('общие константы', () => {
  it('префикс API и краткое название заданы', () => {
    expect(API_PREFIX).toBe('api');
    expect(APP_SHORT_NAME).toBe('ИОТ');
  });
});
