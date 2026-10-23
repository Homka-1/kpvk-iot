import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MotivationLevel,
  QUESTIONNAIRE_LIMITS,
  QuestionnaireStatus,
  QuestionnaireVersionStatus,
  QuestionType,
  ScaleAggregation,
  ScaleMotivationRole,
} from '@iot/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { emptyToNull, trim } from '../common/dto.js';
import { RefDto } from '../disciplines/disciplines.dto.js';
import { queryBoolean } from '../groups/groups.dto.js';

const QUESTION_TYPES = Object.values(QuestionType);
const MOTIVATION_LEVELS = Object.values(MotivationLevel);
const MAX = QUESTIONNAIRE_LIMITS.maxAbsNumber;
const KEY_MESSAGE = 'Некорректный ключ элемента';
const NUMBER_OPTIONS = { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false };

/** Число с точностью DECIMAL(10, 3). */
function Decimal(label: string) {
  return function (target: object, property: string) {
    IsNumber(NUMBER_OPTIONS, { message: `${label}: число, не более трёх знаков после запятой` })(
      target,
      property,
    );
    Min(-MAX, { message: `${label}: слишком маленькое число` })(target, property);
    Max(MAX, { message: `${label}: слишком большое число` })(target, property);
  };
}

/** Необязательная строка: пустое значение сохраняется как null. */
function OptionalText(max: number) {
  return function (target: object, property: string) {
    IsOptional()(target, property);
    Transform(emptyToNull)(target, property);
    IsString({ message: 'Ожидается текст' })(target, property);
    MaxLength(max, { message: `Не более ${max} символов` })(target, property);
  };
}

/** Ключ элемента документа: id из БД или временный ключ нового элемента. */
function ElementKey() {
  return function (target: object, property: string) {
    IsString({ message: KEY_MESSAGE })(target, property);
    Matches(/^[A-Za-z0-9_-]{1,100}$/, { message: KEY_MESSAGE })(target, property);
  };
}

export class AnswerOptionContentDto {
  @ApiProperty({ description: 'id варианта или временный ключ нового' })
  @ElementKey()
  key: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString({ message: 'Введите текст варианта' })
  @MaxLength(500, { message: 'Не более 500 символов' })
  text: string;

  @ApiProperty({ description: 'Значение варианта для подсчёта баллов' })
  @Decimal('Значение варианта')
  value: number;
}

export class QuestionContentDto {
  @ApiProperty({ description: 'id вопроса или временный ключ нового' })
  @ElementKey()
  key: string;

  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString({ message: 'Введите текст вопроса' })
  @MaxLength(2000, { message: 'Не более 2000 символов' })
  text: string;

  @ApiProperty({ enum: QUESTION_TYPES })
  @IsIn(QUESTION_TYPES, { message: 'Выберите тип вопроса' })
  type: QuestionType;

  @ApiProperty()
  @IsBoolean()
  isRequired: boolean;

  @ApiProperty({ nullable: true, type: Number })
  @ValidateIf((_, value) => value !== null)
  @Decimal('Минимум')
  minValue: number | null;

  @ApiProperty({ nullable: true, type: Number })
  @ValidateIf((_, value) => value !== null)
  @Decimal('Максимум')
  maxValue: number | null;

  @ApiProperty({ nullable: true, type: String, description: 'Подпись минимума шкалы Лайкерта' })
  @OptionalText(100)
  minLabel: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Подпись максимума шкалы Лайкерта' })
  @OptionalText(100)
  maxLabel: string | null;

  @ApiProperty({ type: [AnswerOptionContentDto] })
  @IsArray()
  @ArrayMaxSize(QUESTIONNAIRE_LIMITS.optionsPerQuestion, {
    message: `Не более ${QUESTIONNAIRE_LIMITS.optionsPerQuestion} вариантов`,
  })
  @ValidateNested({ each: true })
  @Type(() => AnswerOptionContentDto)
  options: AnswerOptionContentDto[];
}

export class ScoringKeyContentDto {
  @ApiProperty({ description: 'Ключ вопроса этого документа' })
  @ElementKey()
  questionKey: string;

  @ApiProperty({ nullable: true, type: String, description: 'Ключ варианта (ключ по варианту)' })
  @ValidateIf((_, value) => value !== null)
  @ElementKey()
  optionKey: string | null;

  @ApiProperty({ nullable: true, type: Number, description: 'Баллы за выбор варианта' })
  @ValidateIf((_, value) => value !== null)
  @Decimal('Баллы')
  points: number | null;

  @ApiProperty({ description: 'Обратное кодирование' })
  @IsBoolean()
  isReverse: boolean;

  @ApiProperty({ default: 1 })
  @Decimal('Вес')
  weight: number;
}

export class InterpretationRuleContentDto {
  @ApiProperty({ description: 'id правила или временный ключ нового' })
  @ElementKey()
  key: string;

  @ApiProperty({ nullable: true, type: Number, description: 'Нижняя граница (включительно)' })
  @ValidateIf((_, value) => value !== null)
  @Decimal('Нижняя граница')
  minScore: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'Верхняя граница (включительно)' })
  @ValidateIf((_, value) => value !== null)
  @Decimal('Верхняя граница')
  maxScore: number | null;

  @ApiProperty({ maxLength: 30 })
  @Transform(trim)
  @IsString({ message: 'Укажите код уровня' })
  @MaxLength(30, { message: 'Не более 30 символов' })
  levelCode: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString({ message: 'Укажите название уровня' })
  @MaxLength(100, { message: 'Не более 100 символов' })
  levelLabel: string;

  @ApiProperty({ enum: MOTIVATION_LEVELS, nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsIn(MOTIVATION_LEVELS, { message: 'Выберите уровень мотивации' })
  motivationLevel: MotivationLevel | null;

  @ApiProperty({ nullable: true, type: String })
  @OptionalText(2000)
  description: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Понятная студенту интерпретация' })
  @OptionalText(2000)
  studentText: string | null;
}

export class ScaleContentDto {
  @ApiProperty({ description: 'id шкалы или временный ключ новой' })
  @ElementKey()
  key: string;

  @ApiProperty({ example: 'COGNITIVE', description: 'Латинские заглавные буквы, цифры, «_»' })
  @Transform(trim)
  @IsString({ message: 'Укажите код шкалы' })
  @Matches(/^[A-Z0-9_]{0,30}$/, {
    message: 'Код шкалы: до 30 латинских заглавных букв, цифр и «_»',
  })
  code: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString({ message: 'Укажите название шкалы' })
  @MaxLength(200, { message: 'Не более 200 символов' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  @OptionalText(2000)
  description: string | null;

  @ApiPropertyOptional({
    enum: Object.values(ScaleAggregation),
    default: ScaleAggregation.SUM,
    description:
      'Способ расчёта балла шкалы: сумма баллов по ключам или среднее по пунктам шкалы (округляется до 0,1). По умолчанию — сумма.',
  })
  @IsOptional()
  @IsIn(Object.values(ScaleAggregation), { message: 'Выберите способ расчёта шкалы' })
  aggregation?: ScaleAggregation;

  @ApiPropertyOptional({
    enum: Object.values(ScaleMotivationRole),
    default: ScaleMotivationRole.REFERENCE,
    description:
      'Роль шкалы в мотивационном профиле: внутренняя мотивация (определяет уровень методики), внешняя мотивация (только предупреждение о её преобладании) или справочная. По умолчанию — справочная.',
  })
  @IsOptional()
  @IsIn(Object.values(ScaleMotivationRole), { message: 'Выберите роль шкалы' })
  motivationRole?: ScaleMotivationRole;

  @ApiProperty({ type: [ScoringKeyContentDto] })
  @IsArray()
  @ArrayMaxSize(QUESTIONNAIRE_LIMITS.keysPerScale)
  @ValidateNested({ each: true })
  @Type(() => ScoringKeyContentDto)
  keys: ScoringKeyContentDto[];

  @ApiProperty({ type: [InterpretationRuleContentDto] })
  @IsArray()
  @ArrayMaxSize(QUESTIONNAIRE_LIMITS.rulesPerScale, {
    message: `Не более ${QUESTIONNAIRE_LIMITS.rulesPerScale} правил`,
  })
  @ValidateNested({ each: true })
  @Type(() => InterpretationRuleContentDto)
  rules: InterpretationRuleContentDto[];
}

/** Паспорт и содержимое версии методики (п. 4.4 ТЗ). */
export class QuestionnaireContentDto {
  @ApiProperty({ maxLength: 300 })
  @Transform(trim)
  @IsString({ message: 'Укажите название методики' })
  @IsNotEmpty({ message: 'Укажите название методики' })
  @MaxLength(300, { message: 'Не более 300 символов' })
  title: string;

  @ApiProperty({ nullable: true, type: String }) @OptionalText(300) author: string | null;
  @ApiProperty({ nullable: true, type: String }) @OptionalText(2000) purpose: string | null;
  @ApiProperty({ nullable: true, type: String }) @OptionalText(5000) instruction: string | null;
  @ApiProperty({ nullable: true, type: String }) @OptionalText(300) ageRestrictions: string | null;
  @ApiProperty({ nullable: true, type: String }) @OptionalText(1000) source: string | null;
  @ApiProperty({ nullable: true, type: String }) @OptionalText(2000) termsOfUse: string | null;

  @ApiProperty({ description: 'Разрешить студенту сохранять черновик ответов' })
  @IsBoolean()
  allowDraft: boolean;

  @ApiProperty({ nullable: true, type: String, description: 'Что изменилось в этой версии' })
  @OptionalText(1000)
  changeNote: string | null;

  @ApiProperty({ type: [QuestionContentDto] })
  @IsArray()
  @ArrayMaxSize(QUESTIONNAIRE_LIMITS.questions, {
    message: `Не более ${QUESTIONNAIRE_LIMITS.questions} вопросов`,
  })
  @ValidateNested({ each: true })
  @Type(() => QuestionContentDto)
  questions: QuestionContentDto[];

  @ApiProperty({ type: [ScaleContentDto] })
  @IsArray()
  @ArrayMaxSize(QUESTIONNAIRE_LIMITS.scales, {
    message: `Не более ${QUESTIONNAIRE_LIMITS.scales} шкал`,
  })
  @ValidateNested({ each: true })
  @Type(() => ScaleContentDto)
  scales: ScaleContentDto[];
}

export class CreateQuestionnaireDto {
  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID('7', { message: 'Неизвестное диагностическое направление' })
  directionId?: string | null;

  @ApiProperty({ type: QuestionnaireContentDto })
  @ValidateNested()
  @Type(() => QuestionnaireContentDto)
  content: QuestionnaireContentDto;
}

export class UpdateQuestionnaireDto {
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsUUID('7', { message: 'Неизвестное диагностическое направление' })
  directionId: string | null;
}

export class CreateVersionDto {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Что планируется изменить' })
  @OptionalText(1000)
  changeNote?: string | null;
}

export class QuestionnaireListQueryDto {
  @ApiPropertyOptional({ description: 'Показать и архивные методики', default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeArchived = false;
}

export class DirectionInputDto {
  @ApiProperty({ example: 'LEARNING_MOTIVATION' })
  @Transform(trim)
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/, {
    message: 'Код: 2–50 латинских заглавных букв, цифр и «_», начинается с буквы',
  })
  code: string;

  @ApiProperty({ example: 'Учебная мотивация' })
  @Transform(trim)
  @IsString({ message: 'Укажите название направления' })
  @IsNotEmpty({ message: 'Укажите название направления' })
  @MaxLength(200, { message: 'Не более 200 символов' })
  name: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 }, { message: 'Порядок — целое число' })
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

// ── Ответы ──

export class DirectionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() sortOrder: number;
}

export class VersionRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() versionNumber: number;
  @ApiProperty({ enum: Object.values(QuestionnaireVersionStatus) })
  status: QuestionnaireVersionStatus;
}

export class QuestionnaireSummaryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: Object.values(QuestionnaireStatus) }) status: QuestionnaireStatus;
  @ApiProperty({ description: 'Демо-методика: «ДЕМО — не для исследования»' }) isDemo: boolean;
  @ApiProperty({ nullable: true, type: RefDto }) direction: RefDto | null;
  @ApiProperty({ nullable: true, type: VersionRefResponseDto, description: 'Действующая версия' })
  published: VersionRefResponseDto | null;
  @ApiProperty({ nullable: true, type: VersionRefResponseDto }) draft: VersionRefResponseDto | null;
  @ApiProperty({ description: 'Вопросов в последней версии' }) questionCount: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) archivedAt: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export class VersionInfoResponseDto extends VersionRefResponseDto {
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) changeNote: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) publishedAt: string | null;
}

class CopiedFromResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
}

class ComparablePairResponseDto {
  @ApiProperty() versionAId: string;
  @ApiProperty() versionBId: string;
}

export class QuestionnaireDetailResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: Object.values(QuestionnaireStatus) }) status: QuestionnaireStatus;
  @ApiProperty() isDemo: boolean;
  @ApiProperty({ nullable: true, type: RefDto }) direction: RefDto | null;
  @ApiProperty({ nullable: true, type: CopiedFromResponseDto })
  copiedFrom: CopiedFromResponseDto | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) archivedAt: string | null;
  @ApiProperty({ type: [VersionInfoResponseDto], description: 'От новой версии к старой' })
  versions: VersionInfoResponseDto[];
  @ApiProperty({
    type: [ComparablePairResponseDto],
    description: 'Пары версий, сопоставимость которых утвердил исследователь (UC-06)',
  })
  comparabilities: ComparablePairResponseDto[];
}

export class QuestionnaireVersionResponseDto extends VersionInfoResponseDto {
  @ApiProperty() questionnaireId: string;
  @ApiProperty({ type: QuestionnaireContentDto }) content: QuestionnaireContentDto;
}
