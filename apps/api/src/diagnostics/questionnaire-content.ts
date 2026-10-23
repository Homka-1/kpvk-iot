import type { MotivationLevel, QuestionnaireContent, QuestionType } from '@iot/shared';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Преобразование документа содержимого версии методики (`QuestionnaireContent`) в строки таблиц
 * questions, answer_options, questionnaire_scales, scoring_keys, interpretation_rules и обратно.
 * Используется сервисом методик и сидом демо-методики. Записывать можно только черновик:
 * содержимое опубликованной версии защищено триггерами БД (FR-026).
 */
export const versionContentInclude = {
  questions: {
    orderBy: { sortOrder: 'asc' },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  },
  scales: {
    orderBy: { sortOrder: 'asc' },
    include: {
      scoringKeys: { orderBy: { sortOrder: 'asc' } },
      interpretationRules: { orderBy: { sortOrder: 'asc' } },
    },
  },
} satisfies Prisma.QuestionnaireVersionInclude;

export type VersionWithContent = Prisma.QuestionnaireVersionGetPayload<{
  include: typeof versionContentInclude;
}>;

const toNumber = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : value.toNumber();

interface QuestionSettings {
  minLabel?: string | null;
  maxLabel?: string | null;
}

export function readContent(version: VersionWithContent): QuestionnaireContent {
  return {
    title: version.title,
    author: version.author,
    purpose: version.purpose,
    instruction: version.instruction,
    ageRestrictions: version.ageRestrictions,
    source: version.source,
    termsOfUse: version.termsOfUse,
    allowDraft: version.allowDraft,
    changeNote: version.changeNote,
    questions: version.questions.map((question) => {
      const settings = (question.settings ?? {}) as QuestionSettings;
      return {
        key: question.id,
        text: question.text,
        type: question.type as QuestionType,
        isRequired: question.isRequired,
        minValue: toNumber(question.minValue),
        maxValue: toNumber(question.maxValue),
        minLabel: settings.minLabel ?? null,
        maxLabel: settings.maxLabel ?? null,
        options: question.options.map((option) => ({
          key: option.id,
          text: option.text,
          value: option.value.toNumber(),
        })),
      };
    }),
    scales: version.scales.map((scale) => ({
      key: scale.id,
      code: scale.code,
      name: scale.name,
      description: scale.description,
      aggregation: scale.aggregation,
      keys: scale.scoringKeys.map((key) => ({
        questionKey: key.questionId,
        optionKey: key.answerOptionId,
        points: toNumber(key.points),
        isReverse: key.isReverse,
        weight: key.weight.toNumber(),
      })),
      rules: scale.interpretationRules.map((rule) => ({
        key: rule.id,
        minScore: toNumber(rule.minScore),
        maxScore: toNumber(rule.maxScore),
        levelCode: rule.levelCode,
        levelLabel: rule.levelLabel,
        motivationLevel: rule.motivationLevel as MotivationLevel | null,
        description: rule.description,
        studentText: rule.studentText,
      })),
    })),
  };
}

/** Поля паспорта версии для create/update. */
export function passportData(content: QuestionnaireContent) {
  return {
    title: content.title,
    author: content.author,
    purpose: content.purpose,
    instruction: content.instruction,
    ageRestrictions: content.ageRestrictions,
    source: content.source,
    termsOfUse: content.termsOfUse,
    allowDraft: content.allowDraft,
    changeNote: content.changeNote,
  };
}

/**
 * Полностью заменяет вопросы и шкалы черновика содержимым документа. Ключи элементов документа
 * сопоставляются с новыми id; ссылочная целостность проверена заранее (`structuralIssues`).
 */
export async function replaceContent(
  tx: Prisma.TransactionClient,
  versionId: string,
  content: QuestionnaireContent,
): Promise<void> {
  await tx.question.deleteMany({ where: { versionId } });
  await tx.questionnaireScale.deleteMany({ where: { versionId } });

  const questionIds = new Map<string, string>();
  const optionIds = new Map<string, string>();
  for (const [index, question] of content.questions.entries()) {
    const created = await tx.question.create({
      data: {
        versionId,
        sortOrder: index + 1,
        text: question.text,
        type: question.type,
        isRequired: question.isRequired,
        minValue: question.minValue,
        maxValue: question.maxValue,
        settings:
          question.minLabel || question.maxLabel
            ? { minLabel: question.minLabel, maxLabel: question.maxLabel }
            : undefined,
        options: {
          create: question.options.map((option, optionIndex) => ({
            sortOrder: optionIndex + 1,
            text: option.text,
            value: option.value,
          })),
        },
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    questionIds.set(question.key, created.id);
    question.options.forEach((option, optionIndex) =>
      optionIds.set(option.key, created.options[optionIndex]!.id),
    );
  }

  for (const [index, scale] of content.scales.entries()) {
    const created = await tx.questionnaireScale.create({
      data: {
        versionId,
        sortOrder: index + 1,
        code: scale.code,
        name: scale.name,
        description: scale.description,
        aggregation: scale.aggregation,
        interpretationRules: {
          create: scale.rules.map((rule, ruleIndex) => ({
            sortOrder: ruleIndex + 1,
            minScore: rule.minScore,
            maxScore: rule.maxScore,
            levelCode: rule.levelCode,
            levelLabel: rule.levelLabel,
            motivationLevel: rule.motivationLevel,
            description: rule.description,
            studentText: rule.studentText,
          })),
        },
      },
    });
    await tx.scoringKey.createMany({
      data: scale.keys.map((key, keyIndex) => ({
        scaleId: created.id,
        sortOrder: keyIndex + 1,
        questionId: questionIds.get(key.questionKey)!,
        answerOptionId: key.optionKey === null ? null : optionIds.get(key.optionKey)!,
        points: key.points,
        isReverse: key.isReverse,
        weight: key.weight,
      })),
    });
  }
}
