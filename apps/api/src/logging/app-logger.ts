import type { LoggerService } from '@nestjs/common';
import { pino, type Logger } from 'pino';
import { maskPersonalData, maskString } from './mask.js';

/** Корневой логгер pino. В тестах по умолчанию выводит только ошибки. */
export function createRootLogger(): Logger {
  const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'error' : 'info');
  return pino({ level, base: undefined, timestamp: pino.stdTimeFunctions.isoTime });
}

/**
 * Логгер Nest поверх pino. Все сообщения и параметры проходят маскирование ПДн,
 * поэтому даже случайно переданные данные пользователя не попадут в журнал.
 */
export class AppLogger implements LoggerService {
  constructor(private readonly logger: Logger = createRootLogger()) {}

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }

  /** Структурная запись: объект с полями и текст сообщения. */
  write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace',
    message: unknown,
    params: unknown[] = [],
  ): void {
    // Nest передаёт последним параметром контекст (имя класса).
    const context =
      params.length > 0 && typeof params[params.length - 1] === 'string'
        ? (params.pop() as string)
        : undefined;
    const fields: Record<string, unknown> = {};
    if (context) fields.context = context;
    if (params.length > 0) fields.details = maskPersonalData(params);
    if (typeof message === 'string') {
      this.logger[level](fields, maskString(message));
    } else {
      this.logger[level]({ ...fields, data: maskPersonalData(message) });
    }
  }
}
