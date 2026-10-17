import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type AnswerMap, answerError, publishIssues, scoreQuestionnaire } from '@iot/shared';
import { loadDefinitions } from './questionnaire-definitions.js';

/**
 * Контрольные примеры методик (п. 11.3 ТЗ): автоматический расчёт обязан совпадать с ожидаемыми
 * результатами. Каждый файл `test/fixtures/diagnostics/<методика>/<версия>/*.json` содержит
 * ответы (ключи вопросов и вариантов из файла определения) и ожидаемые баллы по кодам шкал.
 */
interface ControlExample {
  description: string;
  answers: AnswerMap;
  expected: Record<
    string,
    { rawScore: number | null; missingAnswers: number; levelCode: string | null }
  >;
}

const FIXTURES_DIR = resolve(import.meta.dirname, '../../test/fixtures/diagnostics');
const definitions = loadDefinitions();

function examplesFor(slug: string, version: number): [string, ControlExample][] {
  const dir = join(FIXTURES_DIR, slug, String(version));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => [file, JSON.parse(readFileSync(join(dir, file), 'utf8')) as ControlExample]);
}

describe('п. 11.3: контрольные примеры методик', () => {
  it('каждая папка примеров относится к существующему определению методики', () => {
    for (const slug of readdirSync(FIXTURES_DIR)) {
      for (const version of readdirSync(join(FIXTURES_DIR, slug))) {
        expect(definitions.some((d) => d.slug === slug && String(d.version) === version)).toBe(
          true,
        );
      }
    }
  });

  describe.each(definitions.map((d) => [`${d.slug} v${d.version}`, d] as const))(
    '%s',
    (_, definition) => {
      const examples = examplesFor(definition.slug, definition.version);

      it('определение проходит проверку публикации, у методики есть контрольные примеры', () => {
        expect(publishIssues(definition.content, definition.isDemo)).toEqual([]);
        expect(examples.length).toBeGreaterThan(0);
      });

      it.each(examples)('FR-020, FR-021: %s', (_file, example) => {
        for (const question of definition.content.questions) {
          expect(answerError(question, example.answers[question.key])).toBeNull();
        }
        const actual = Object.fromEntries(
          scoreQuestionnaire(definition.content, example.answers).map((score) => [
            score.code,
            {
              rawScore: score.rawScore,
              missingAnswers: score.missingAnswers,
              levelCode: score.rule?.levelCode ?? null,
            },
          ]),
        );
        expect(actual).toEqual(example.expected);
      });
    },
  );
});
