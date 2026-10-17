// Диагностические методики (ТЗ, п. 4.4; FR-017, FR-020, FR-021, FR-026, п. 11.3).
// Содержимое версии методики передаётся одним документом `QuestionnaireContent`: так его
// редактирует конструктор, сохраняет API и читает движок расчёта. Движок и проверки — чистые
// функции: одни и те же правила работают в предпросмотре интерфейса, на сервере и в тестах
// контрольных примеров.
import type {
  MotivationLevel,
  QuestionnaireStatus,
  QuestionnaireVersionStatus,
  QuestionType,
} from './enums.js';

/** Обязательная пометка демо-методики в названии и источнике (огр. 1 ТЗ, ADR-003). */
export const DEMO_MARK = 'ДЕМО — не для исследования';

/** Пределы размера методики: защищают сервер и интерфейс от неправдоподобно больших документов. */
export const QUESTIONNAIRE_LIMITS = {
  questions: 300,
  optionsPerQuestion: 30,
  scales: 30,
  keysPerScale: 300,
  rulesPerScale: 20,
  /** Наибольший размах шкалы Лайкерта (число делений минус один). */
  likertSpan: 10,
  /** Абсолютная величина чисел (баллы, границы, веса): DECIMAL(10, 3) в БД. */
  maxAbsNumber: 9_999_999,
} as const;

/** Коды диагностических направлений из п. 4.4 ТЗ (заполняются миграцией, список можно расширять). */
export const DEFAULT_DIRECTION_CODES = [
  'LEARNING_MOTIVATION',
  'SELF_REGULATION',
  'ACADEMIC_SUCCESS',
  'PEDAGOGICAL_OBSERVATION',
  'FINAL_CONCLUSION',
] as const;

// ── Документ содержимого версии ──

/**
 * `key` — идентификатор элемента внутри документа. В ответах API это id записи в БД;
 * для новых элементов конструктор задаёт временный ключ, сервер заменяет его при сохранении.
 */
export interface AnswerOptionContent {
  key: string;
  text: string;
  /** Значение варианта: используется, если ключ начисления не задаёт баллы явно. */
  value: number;
}

export interface QuestionContent {
  key: string;
  text: string;
  type: QuestionType;
  isRequired: boolean;
  /** Границы шкалы Лайкерта (обязательны) и числового ответа (необязательны). */
  minValue: number | null;
  maxValue: number | null;
  /** Подписи полюсов шкалы Лайкерта. */
  minLabel: string | null;
  maxLabel: string | null;
  /** Варианты ответа для вопросов с выбором; для остальных типов — пустой список. */
  options: AnswerOptionContent[];
}

/**
 * Ключ начисления баллов (FR-020, FR-021).
 * - Без варианта: вклад вопроса равен значению ответа (число, значение выбранного варианта или
 *   сумма значений выбранных вариантов), с обратным кодированием `min + max − значение`.
 * - С вариантом: если вариант выбран, начисляется `points` (или значение варианта).
 * Вклад умножается на `weight`.
 */
export interface ScoringKeyContent {
  questionKey: string;
  optionKey: string | null;
  points: number | null;
  isReverse: boolean;
  weight: number;
}

/** Правило интерпретации: диапазон сырого балла шкалы (границы включительно) → уровень. */
export interface InterpretationRuleContent {
  key: string;
  minScore: number | null;
  maxScore: number | null;
  levelCode: string;
  levelLabel: string;
  /** Вклад уровня в мотивационный профиль (этап 09); null — шкала профиль не определяет. */
  motivationLevel: MotivationLevel | null;
  description: string | null;
  /** Понятная студенту интерпретация (FR-016). */
  studentText: string | null;
}

export interface ScaleContent {
  key: string;
  code: string;
  name: string;
  description: string | null;
  keys: ScoringKeyContent[];
  rules: InterpretationRuleContent[];
}

/** Паспорт и содержимое версии методики (все поля п. 4.4 ТЗ). Порядок в массивах — порядок показа. */
export interface QuestionnaireContent {
  title: string;
  author: string | null;
  purpose: string | null;
  instruction: string | null;
  ageRestrictions: string | null;
  source: string | null;
  termsOfUse: string | null;
  /** Разрешено ли студенту сохранять черновик ответов (UC-01). */
  allowDraft: boolean;
  /** Что изменилось в этой версии. */
  changeNote: string | null;
  questions: QuestionContent[];
  scales: ScaleContent[];
}

/** Пустая методика для мастера создания. */
export function emptyQuestionnaireContent(title: string): QuestionnaireContent {
  return {
    title,
    author: null,
    purpose: null,
    instruction: null,
    ageRestrictions: null,
    source: null,
    termsOfUse: null,
    allowDraft: true,
    changeNote: null,
    questions: [],
    scales: [],
  };
}

export function isChoiceQuestion(type: QuestionType): boolean {
  return type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
}

// ── Контракты API ──

export interface DiagnosticDirectionDto {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface QuestionnaireVersionRef {
  id: string;
  versionNumber: number;
  status: QuestionnaireVersionStatus;
}

/** Строка списка методик. */
export interface QuestionnaireSummaryDto {
  id: string;
  /** Название последней версии. */
  title: string;
  status: QuestionnaireStatus;
  isDemo: boolean;
  direction: { id: string; name: string } | null;
  /** Действующая (опубликованная) версия — её можно назначать студентам (этап 07). */
  published: QuestionnaireVersionRef | null;
  draft: QuestionnaireVersionRef | null;
  questionCount: number;
  archivedAt: string | null;
  updatedAt: string;
}

export interface QuestionnaireVersionInfoDto extends QuestionnaireVersionRef {
  title: string;
  changeNote: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface QuestionnaireDetailDto {
  id: string;
  status: QuestionnaireStatus;
  isDemo: boolean;
  direction: { id: string; name: string } | null;
  copiedFrom: { id: string; title: string } | null;
  archivedAt: string | null;
  /** Версии от новой к старой. */
  versions: QuestionnaireVersionInfoDto[];
}

export interface QuestionnaireVersionDto extends QuestionnaireVersionInfoDto {
  questionnaireId: string;
  content: QuestionnaireContent;
}

// ── Ответы и расчёт ──

/**
 * Значение ответа по типу вопроса: ключ варианта (один вариант), список ключей (несколько
 * вариантов; пустой список — «ничего не выбрано»), число (шкала Лайкерта, числовой ответ),
 * строка (короткий текст). `null` или отсутствие значения — пропуск.
 */
export type AnswerValue = string | string[] | number | null;
export type AnswerMap = Readonly<Record<string, AnswerValue | undefined>>;

const TEXT_ANSWER_MAX = 500;

/** Сообщение об ошибке ответа или null, если ответ допустим. Пропуск ответа здесь не ошибка. */
export function answerError(
  question: QuestionContent,
  value: AnswerValue | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const optionKeys = new Set(question.options.map((option) => option.key));
  switch (question.type) {
    case 'SINGLE_CHOICE':
      return typeof value === 'string' && optionKeys.has(value)
        ? null
        : 'Выберите один из вариантов';
    case 'MULTIPLE_CHOICE':
      return Array.isArray(value) &&
        value.every((item) => optionKeys.has(item)) &&
        new Set(value).size === value.length
        ? null
        : 'Выберите варианты из списка';
    case 'LIKERT':
      if (typeof value !== 'number' || !Number.isInteger(value)) return 'Выберите деление шкалы';
      return inBounds(value, question) ? null : 'Значение вне шкалы';
    case 'NUMBER':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Введите число';
      if (!inBounds(value, question)) {
        return `Число должно быть в пределах ${boundsText(question)}`;
      }
      return Math.abs(value) > QUESTIONNAIRE_LIMITS.maxAbsNumber ? 'Слишком большое число' : null;
    case 'SHORT_TEXT':
      if (typeof value !== 'string') return 'Введите текст';
      return value.length > TEXT_ANSWER_MAX ? `Не более ${TEXT_ANSWER_MAX} символов` : null;
  }
}

/** Есть ли ответ: пустая строка и пустой ответ считаются пропуском, пустой список выбора — нет. */
export function isAnswered(question: QuestionContent, value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && question.type === 'SHORT_TEXT') return value.trim() !== '';
  return answerError(question, value) === null;
}

function inBounds(value: number, question: QuestionContent): boolean {
  return (
    (question.minValue === null || value >= question.minValue) &&
    (question.maxValue === null || value <= question.maxValue)
  );
}

function boundsText(question: QuestionContent): string {
  if (question.minValue !== null && question.maxValue !== null) {
    return `от ${question.minValue} до ${question.maxValue}`;
  }
  return question.minValue !== null ? `от ${question.minValue}` : `до ${question.maxValue}`;
}

/** Результат расчёта по шкале. `rawScore = null` — нет данных (FR-074), а не ноль. */
export interface ScaleScore {
  scaleKey: string;
  code: string;
  name: string;
  rawScore: number | null;
  /** Сколько вопросов шкалы осталось без ответа. */
  missingAnswers: number;
  /** Подходящее правило интерпретации; null — балла нет или он не попал ни в один диапазон. */
  rule: InterpretationRuleContent | null;
}

/** Округление до трёх знаков, как в БД (DECIMAL(10, 3)): убирает погрешность двоичной арифметики. */
export function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

/**
 * Расчёт баллов по всем шкалам версии (FR-020, FR-021). Недопустимый ответ считается пропуском;
 * ответы проверяет вызывающая сторона (`answerError`). Если хотя бы на один вопрос шкалы нет
 * ответа, балл шкалы не рассчитывается (ADR-012): частичная сумма исказила бы уровень.
 */
export function scoreQuestionnaire(
  content: QuestionnaireContent,
  answers: AnswerMap,
): ScaleScore[] {
  const questions = new Map(content.questions.map((question) => [question.key, question]));
  return content.scales.map((scale) => {
    const keyedQuestions = new Set(scale.keys.map((key) => key.questionKey));
    let missingAnswers = 0;
    for (const questionKey of keyedQuestions) {
      const question = questions.get(questionKey);
      if (!question || !isAnswered(question, answers[questionKey])) missingAnswers += 1;
    }
    let rawScore: number | null = null;
    if (missingAnswers === 0 && keyedQuestions.size > 0) {
      let sum = 0;
      for (const key of scale.keys) {
        sum += keyContribution(key, questions.get(key.questionKey)!, answers[key.questionKey]!);
      }
      rawScore = roundScore(sum);
    }
    return {
      scaleKey: scale.key,
      code: scale.code,
      name: scale.name,
      rawScore,
      missingAnswers,
      rule: rawScore === null ? null : matchRule(scale.rules, rawScore),
    };
  });
}

function keyContribution(
  key: ScoringKeyContent,
  question: QuestionContent,
  value: AnswerValue,
): number {
  const selected = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  if (key.optionKey !== null) {
    if (!selected.includes(key.optionKey)) return 0;
    const option = question.options.find((item) => item.key === key.optionKey);
    return (key.points ?? option?.value ?? 0) * key.weight;
  }
  const raw =
    typeof value === 'number'
      ? value
      : selected.reduce(
          (sum, optionKey) =>
            sum + (question.options.find((option) => option.key === optionKey)?.value ?? 0),
          0,
        );
  if (!key.isReverse) return raw * key.weight;
  const { min, max } = reverseBounds(question)!;
  return (min + max - raw) * key.weight;
}

/** Границы для обратного кодирования; null — для вопроса обратное кодирование невозможно. */
function reverseBounds(question: QuestionContent): { min: number; max: number } | null {
  if (question.type === 'SINGLE_CHOICE') {
    if (question.options.length === 0) return null;
    const values = question.options.map((option) => option.value);
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  if (question.type === 'LIKERT' || question.type === 'NUMBER') {
    if (question.minValue === null || question.maxValue === null) return null;
    return { min: question.minValue, max: question.maxValue };
  }
  return null;
}

/** Первое правило, в диапазон которого (включительно) попадает балл. */
export function matchRule(
  rules: readonly InterpretationRuleContent[],
  score: number,
): InterpretationRuleContent | null {
  return (
    rules.find(
      (rule) =>
        (rule.minScore === null || score >= rule.minScore) &&
        (rule.maxScore === null || score <= rule.maxScore),
    ) ?? null
  );
}

// ── Проверки ──

/** Замечание к содержимому методики: `path` указывает на поле документа, например `questions.2.text`. */
export interface ContentIssue {
  path: string;
  message: string;
}

/**
 * Ссылочная целостность документа: уникальные ключи, ключи начисления указывают на вопросы и
 * варианты этого же документа, коды шкал уникальны. Проверяется при каждом сохранении черновика.
 */
export function structuralIssues(content: QuestionnaireContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const seenKeys = new Set<string>();
  const unique = (key: string, path: string) => {
    if (seenKeys.has(key)) issues.push({ path, message: 'Повторяющийся ключ элемента' });
    seenKeys.add(key);
  };
  const questions = new Map<string, QuestionContent>();
  content.questions.forEach((question, index) => {
    unique(question.key, `questions.${index}.key`);
    questions.set(question.key, question);
    question.options.forEach((option, optionIndex) =>
      unique(option.key, `questions.${index}.options.${optionIndex}.key`),
    );
  });
  const codes = new Set<string>();
  content.scales.forEach((scale, index) => {
    unique(scale.key, `scales.${index}.key`);
    const code = scale.code.toUpperCase();
    if (codes.has(code))
      issues.push({ path: `scales.${index}.code`, message: 'Код шкалы повторяется' });
    codes.add(code);
    scale.rules.forEach((rule, ruleIndex) =>
      unique(rule.key, `scales.${index}.rules.${ruleIndex}.key`),
    );
    scale.keys.forEach((key, keyIndex) => {
      const path = `scales.${index}.keys.${keyIndex}`;
      const question = questions.get(key.questionKey);
      if (!question) {
        issues.push({ path: `${path}.questionKey`, message: 'Вопрос не найден в методике' });
      } else if (key.optionKey !== null && !question.options.some((o) => o.key === key.optionKey)) {
        issues.push({ path: `${path}.optionKey`, message: 'Вариант не найден у вопроса' });
      }
    });
  });
  return issues;
}

/**
 * Полная проверка перед публикацией версии: после публикации версия неизменяема (FR-026),
 * поэтому всё, что влияет на расчёт, должно быть согласовано заранее.
 */
export function publishIssues(content: QuestionnaireContent, isDemo: boolean): ContentIssue[] {
  const issues = structuralIssues(content);
  const add = (path: string, message: string) => issues.push({ path, message });

  if (!content.title.trim()) add('title', 'Укажите название методики');
  if (isDemo) {
    if (!content.title.includes(DEMO_MARK))
      add('title', `Название демо-методики должно содержать «${DEMO_MARK}»`);
    if (!content.source?.includes(DEMO_MARK))
      add('source', `Источник демо-методики должен содержать «${DEMO_MARK}»`);
  }
  if (content.questions.length === 0) add('questions', 'Добавьте хотя бы один вопрос');
  if (content.scales.length === 0) add('scales', 'Добавьте хотя бы одну шкалу');

  const questions = new Map(content.questions.map((question) => [question.key, question]));
  content.questions.forEach((question, index) => {
    const path = `questions.${index}`;
    if (!question.text.trim()) add(`${path}.text`, `Вопрос ${index + 1}: введите текст`);
    if (isChoiceQuestion(question.type)) {
      if (question.options.length < 2)
        add(`${path}.options`, `Вопрос ${index + 1}: нужно не меньше двух вариантов`);
      question.options.forEach((option, optionIndex) => {
        if (!option.text.trim()) {
          add(
            `${path}.options.${optionIndex}.text`,
            `Вопрос ${index + 1}: введите текст варианта ${optionIndex + 1}`,
          );
        }
      });
    } else if (question.options.length > 0) {
      add(
        `${path}.options`,
        `Вопрос ${index + 1}: варианты ответа допустимы только для вопросов с выбором`,
      );
    }
    const { minValue: min, maxValue: max } = question;
    if (question.type === 'LIKERT') {
      if (min === null || max === null || !Number.isInteger(min) || !Number.isInteger(max)) {
        add(`${path}.minValue`, `Вопрос ${index + 1}: укажите целые границы шкалы`);
      } else if (max <= min || max - min > QUESTIONNAIRE_LIMITS.likertSpan) {
        add(
          `${path}.maxValue`,
          `Вопрос ${index + 1}: шкала должна содержать от 2 до ${QUESTIONNAIRE_LIMITS.likertSpan + 1} делений`,
        );
      }
    } else if (question.type === 'NUMBER') {
      if (min !== null && max !== null && max < min) {
        add(`${path}.maxValue`, `Вопрос ${index + 1}: максимум меньше минимума`);
      }
    } else if (min !== null || max !== null) {
      add(
        `${path}.minValue`,
        `Вопрос ${index + 1}: границы допустимы только для шкалы Лайкерта и числового ответа`,
      );
    }
  });

  content.scales.forEach((scale, index) => {
    const path = `scales.${index}`;
    const label = scale.name.trim() || `№ ${index + 1}`;
    if (!scale.code.trim()) add(`${path}.code`, `Шкала ${label}: укажите код`);
    if (!scale.name.trim()) add(`${path}.name`, `Шкала № ${index + 1}: укажите название`);
    if (scale.keys.length === 0)
      add(`${path}.keys`, `Шкала ${label}: задайте ключи начисления баллов`);

    const seen = new Set<string>();
    scale.keys.forEach((key, keyIndex) => {
      const keyPath = `${path}.keys.${keyIndex}`;
      const question = questions.get(key.questionKey);
      if (!question) return; // уже отмечено в structuralIssues
      const where = `Шкала ${label}, ключ ${keyIndex + 1}`;
      const signature = `${key.questionKey}|${key.optionKey ?? ''}`;
      if (seen.has(signature)) add(keyPath, `${where}: ключ для этого вопроса уже задан`);
      seen.add(signature);
      if (key.weight === 0) add(`${keyPath}.weight`, `${where}: вес не может быть нулевым`);
      if (question.type === 'SHORT_TEXT') {
        add(`${keyPath}.questionKey`, `${where}: текстовый ответ не участвует в подсчёте баллов`);
        return;
      }
      if (key.optionKey !== null) {
        if (key.isReverse)
          add(
            `${keyPath}.isReverse`,
            `${where}: обратное кодирование не применяется к ключу по варианту`,
          );
        return;
      }
      if (key.points !== null)
        add(`${keyPath}.points`, `${where}: баллы задаются только для ключа по варианту`);
      if (key.isReverse && !reverseBounds(question)) {
        add(
          `${keyPath}.isReverse`,
          question.type === 'MULTIPLE_CHOICE'
            ? `${where}: обратное кодирование невозможно для вопроса с несколькими вариантами`
            : `${where}: для обратного кодирования у вопроса должны быть заданы минимум и максимум`,
        );
      }
    });

    const levelCodes = new Set<string>();
    scale.rules.forEach((rule, ruleIndex) => {
      const rulePath = `${path}.rules.${ruleIndex}`;
      const where = `Шкала ${label}, правило ${ruleIndex + 1}`;
      if (!rule.levelCode.trim()) add(`${rulePath}.levelCode`, `${where}: укажите код уровня`);
      if (!rule.levelLabel.trim())
        add(`${rulePath}.levelLabel`, `${where}: укажите название уровня`);
      if (levelCodes.has(rule.levelCode))
        add(`${rulePath}.levelCode`, `${where}: код уровня повторяется`);
      levelCodes.add(rule.levelCode);
      if (rule.minScore !== null && rule.maxScore !== null && rule.minScore > rule.maxScore) {
        add(`${rulePath}.maxScore`, `${where}: верхняя граница меньше нижней`);
      }
    });
    const sorted = [...scale.rules].sort(
      (a, b) => (a.minScore ?? -Infinity) - (b.minScore ?? -Infinity),
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const previousMax = sorted[i - 1]!.maxScore ?? Infinity;
      const currentMin = sorted[i]!.minScore ?? -Infinity;
      if (currentMin <= previousMax) {
        add(
          `${path}.rules`,
          `Шкала ${label}: диапазоны уровней «${sorted[i - 1]!.levelLabel}» и «${sorted[i]!.levelLabel}» пересекаются`,
        );
      }
    }
  });
  return issues;
}

/** Диапазон баллов шкалы, который допускают ключи (для подсказки при задании интерпретации). */
export function scaleScoreRange(
  content: QuestionnaireContent,
  scale: ScaleContent,
): { min: number; max: number } | null {
  const questions = new Map(content.questions.map((question) => [question.key, question]));
  let min = 0;
  let max = 0;
  for (const key of scale.keys) {
    const question = questions.get(key.questionKey);
    if (!question || question.type === 'SHORT_TEXT') return null;
    let low: number;
    let high: number;
    if (key.optionKey !== null) {
      const option = question.options.find((item) => item.key === key.optionKey);
      const points = key.points ?? option?.value ?? 0;
      low = Math.min(0, points);
      high = Math.max(0, points);
    } else if (question.type === 'MULTIPLE_CHOICE') {
      const values = question.options.map((option) => option.value);
      low = values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
      high = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    } else {
      const bounds = reverseBounds(question);
      if (!bounds) return null;
      low = bounds.min;
      high = bounds.max;
    }
    const a = low * key.weight;
    const b = high * key.weight;
    min += Math.min(a, b);
    max += Math.max(a, b);
  }
  return { min: roundScore(min), max: roundScore(max) };
}
