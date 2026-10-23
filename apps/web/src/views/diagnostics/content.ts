import {
  isChoiceQuestion,
  QUESTION_TYPE_LABELS,
  QUESTIONNAIRE_VERSION_STATUS_LABELS,
  type InterpretationRuleContent,
  type QuestionContent,
  type QuestionnaireContent,
  type QuestionnaireVersionStatus,
  type QuestionType,
  type ScaleContent,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';

/**
 * Правка документа методики в конструкторе. Функции изменяют переданный документ на месте
 * (он реактивный) и поддерживают ссылочную целостность: удаление вопроса или варианта убирает
 * ключи начисления, которые на него ссылались. Окончательную проверку выполняет сервер.
 */

/** Временный ключ нового элемента; при сохранении сервер заменит его на id. */
export function newKey(): string {
  return `new-${crypto.randomUUID()}`;
}

export const QUESTION_TYPE_OPTIONS = (Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(
  (value) => ({ value, label: QUESTION_TYPE_LABELS[value] }),
);

export function newQuestion(type: QuestionType = 'LIKERT'): QuestionContent {
  const question: QuestionContent = {
    key: newKey(),
    text: '',
    type,
    isRequired: true,
    minValue: null,
    maxValue: null,
    minLabel: null,
    maxLabel: null,
    options: [],
  };
  applyTypeDefaults(question);
  return question;
}

function applyTypeDefaults(question: QuestionContent): void {
  if (question.type === 'LIKERT') {
    question.minValue = 1;
    question.maxValue = 5;
  } else {
    question.minValue = null;
    question.maxValue = null;
    question.minLabel = null;
    question.maxLabel = null;
  }
  if (isChoiceQuestion(question.type)) {
    if (question.options.length === 0) {
      question.options = [
        { key: newKey(), text: '', value: 1 },
        { key: newKey(), text: '', value: 0 },
      ];
    }
  } else {
    question.options = [];
  }
}

/** Смена типа вопроса: границы и варианты по умолчанию, ключи по удалённым вариантам убираются. */
export function changeQuestionType(
  content: QuestionnaireContent,
  question: QuestionContent,
  type: QuestionType,
): void {
  if (question.type === type) return;
  question.type = type;
  applyTypeDefaults(question);
  pruneKeys(content);
}

export function moveItem<T>(items: T[], index: number, offset: -1 | 1): void {
  const target = index + offset;
  if (target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target]!, items[index]!];
}

export function removeQuestion(content: QuestionnaireContent, index: number): void {
  content.questions.splice(index, 1);
  pruneKeys(content);
}

export function removeOption(
  content: QuestionnaireContent,
  question: QuestionContent,
  index: number,
): void {
  question.options.splice(index, 1);
  pruneKeys(content);
}

/** Убирает ключи начисления, ссылающиеся на удалённые вопросы и варианты. */
function pruneKeys(content: QuestionnaireContent): void {
  const questions = new Map(content.questions.map((question) => [question.key, question]));
  for (const scale of content.scales) {
    scale.keys = scale.keys.filter((key) => {
      const question = questions.get(key.questionKey);
      if (!question) return false;
      return key.optionKey === null || question.options.some((o) => o.key === key.optionKey);
    });
  }
}

export function newScale(index: number): ScaleContent {
  return {
    key: newKey(),
    code: `SCALE_${index + 1}`,
    name: '',
    description: null,
    aggregation: 'SUM',
    motivationRole: 'REFERENCE',
    keys: [],
    rules: [],
  };
}

export function newRule(): InterpretationRuleContent {
  return {
    key: newKey(),
    minScore: null,
    maxScore: null,
    levelCode: '',
    levelLabel: '',
    motivationLevel: null,
    description: null,
    studentText: null,
  };
}

/** Короткая подпись вопроса для списков выбора: «3. Текст вопроса…». */
export function questionLabel(content: QuestionnaireContent, key: string): string {
  const index = content.questions.findIndex((question) => question.key === key);
  if (index < 0) return 'Вопрос удалён';
  const text = content.questions[index]!.text.trim() || 'Без текста';
  return `${index + 1}. ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`;
}

const VERSION_TONES: Record<QuestionnaireVersionStatus, StatusTone> = {
  DRAFT: 'warning',
  PUBLISHED: 'success',
  RETIRED: 'neutral',
};
const VERSION_ICONS: Record<QuestionnaireVersionStatus, string> = {
  DRAFT: 'pi pi-pencil',
  PUBLISHED: 'pi pi-check-circle',
  RETIRED: 'pi pi-history',
};

/** Бейдж статуса версии: цвет, текст и иконка (п. 6.1). */
export function versionBadge(status: QuestionnaireVersionStatus) {
  return {
    label: QUESTIONNAIRE_VERSION_STATUS_LABELS[status],
    tone: VERSION_TONES[status],
    icon: VERSION_ICONS[status],
  };
}

/** Число в русской записи: запятая как десятичный разделитель. */
export function formatScore(value: number | null): string {
  return value === null
    ? 'Нет данных'
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
