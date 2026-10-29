/** Даты демо-активности: строки «ГГГГ-ММ-ДД» и моменты по местному времени колледжа (UTC+5). */
const OFFSET = '+05:00';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Момент `date` в `time` («ЧЧ:ММ») по времени колледжа, со сдвигом в минутах. */
export function at(date: string, time = '09:00', minutes = 0): Date {
  return new Date(Date.parse(`${date}T${time}:00${OFFSET}`) + minutes * 60 * 1000);
}

/** Календарная дата для полей `@db.Date`. */
export function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** День недели: 1 — понедельник … 7 — воскресенье. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

/** Ближайший рабочий день (пн–пт) не раньше `date`. */
export function workday(date: string): string {
  let result = date;
  while (weekday(result) > 5) result = addDays(result, 1);
  return result;
}

/** Случайный момент рабочего времени (9:00–18:00) в день `date`. */
export function workTime(date: string, random: () => number): Date {
  return at(workday(date), '09:00', Math.floor(random() * 9 * 60));
}

export function laterOf(a: Date, b: Date): Date {
  return a > b ? a : b;
}
