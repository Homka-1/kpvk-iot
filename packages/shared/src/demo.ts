/**
 * Демонстрационный режим: копия рабочей базы, наполненная активностью за период исследования.
 * Пока режим включён, все пользователи работают с копией; рабочие данные не изменяются.
 */

/** Что сгенерировано в копии: ничего, первичный замер с учебным периодом, повторный замер. */
export const DemoStage = {
  NONE: 'NONE',
  PRIMARY: 'PRIMARY',
  REPEATED: 'REPEATED',
} as const;
export type DemoStage = (typeof DemoStage)[keyof typeof DemoStage];

export const DemoJobKind = {
  PREPARE: 'PREPARE',
  REPEAT: 'REPEAT',
} as const;
export type DemoJobKind = (typeof DemoJobKind)[keyof typeof DemoJobKind];

export const DemoJobStatus = {
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;
export type DemoJobStatus = (typeof DemoJobStatus)[keyof typeof DemoJobStatus];

export interface DemoJobDto {
  kind: DemoJobKind;
  status: DemoJobStatus;
  /** Текущий шаг или итог. */
  step: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface DemoStatusDto {
  /** Сайт показывает демонстрационные данные. */
  active: boolean;
  /** Копия базы существует. */
  exists: boolean;
  stage: DemoStage;
  job: DemoJobDto | null;
  /** Период исследования, за который создаётся активность. */
  period: { from: string; to: string };
}
