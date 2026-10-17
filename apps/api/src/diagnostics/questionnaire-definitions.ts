import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { QuestionnaireContent } from '@iot/shared';

/**
 * Файлы определений методик: `apps/api/prisma/questionnaires/<методика>/v<версия>.json`.
 * Из них сид заполняет БД, а тест контрольных примеров (п. 11.3 ТЗ) сверяет расчёт с
 * ожидаемыми результатами из `apps/api/test/fixtures/diagnostics/<методика>/<версия>/*.json`.
 * Реальные методики заказчика добавляются сюда же вместе с их контрольными примерами.
 */
export const DEFINITIONS_DIR = resolve(import.meta.dirname, '../../prisma/questionnaires');

export interface QuestionnaireDefinition {
  slug: string;
  version: number;
  /** Код диагностического направления (diagnostic_directions.code). */
  directionCode: string | null;
  isDemo: boolean;
  content: QuestionnaireContent;
}

export function loadDefinitions(dir = DEFINITIONS_DIR): QuestionnaireDefinition[] {
  const definitions: QuestionnaireDefinition[] = [];
  for (const slug of readdirSync(dir).sort()) {
    for (const file of readdirSync(join(dir, slug)).sort()) {
      const match = /^v(\d+)\.json$/.exec(file);
      if (!match) continue;
      const data = JSON.parse(readFileSync(join(dir, slug, file), 'utf8')) as Omit<
        QuestionnaireDefinition,
        'slug' | 'version'
      >;
      definitions.push({ slug, version: Number(match[1]), ...data });
    }
  }
  return definitions;
}
