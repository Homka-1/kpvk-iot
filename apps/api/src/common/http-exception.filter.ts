import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  type ValidationError,
} from '@nestjs/common';
import type { ApiErrorBody } from '@iot/shared';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import type { AppLogger } from '../logging/app-logger.js';

/** Понятные сообщения по статусу, если исключение не содержит русского текста (NFR-005). */
const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Некорректный запрос',
  401: 'Требуется вход в систему',
  403: 'Недостаточно прав для выполнения действия',
  404: 'Запрошенные данные не найдены',
  409: 'Действие конфликтует с текущим состоянием данных',
  413: 'Слишком большой запрос',
  423: 'Учётная запись временно заблокирована',
  429: 'Слишком много запросов. Повторите попытку позже',
  500: 'Внутренняя ошибка сервера. Повторите попытку позже или обратитесь к администратору',
};

const PRISMA_ERRORS: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: 'Запись с такими данными уже существует' },
  P2025: { status: 404, message: 'Запрошенные данные не найдены' },
  // Нарушение внешнего ключа или запрет изменения неизменяемой записи (триггер forbid_modification).
  P2003: {
    status: 409,
    message: 'Действие невозможно: запись связана с другими данными или защищена от изменения',
  },
};

const CYRILLIC = /[А-Яа-яЁё]/;

/** Сначала сообщаем об отсутствии значения, затем — о формате. */
const CONSTRAINT_PRIORITY = ['isDefined', 'isNotEmpty', 'isString', 'isArray', 'arrayMinSize'];

function firstMessage(constraints: Record<string, string>): string | undefined {
  const key =
    CONSTRAINT_PRIORITY.find((name) => name in constraints) ?? Object.keys(constraints)[0];
  return key ? constraints[key] : undefined;
}

/** Ошибка проверки входных данных с сообщениями по полям. */
export function validationException(errors: ValidationError[]): BadRequestException {
  const fields: Record<string, string> = {};
  const collect = (list: ValidationError[], prefix: string) => {
    for (const error of list) {
      const name = prefix ? `${prefix}.${error.property}` : error.property;
      const message = error.constraints ? firstMessage(error.constraints) : undefined;
      if (message) fields[name] = CYRILLIC.test(message) ? message : 'Некорректное значение';
      if (error.children?.length) collect(error.children, name);
    }
  };
  collect(errors, '');
  return new BadRequestException({ message: 'Проверьте правильность заполнения формы', fields });
}

/**
 * Единый формат ошибок API: `{ statusCode, message, fields? }`. Сообщения — на русском,
 * внутренние подробности (стек, SQL) клиенту не передаются; ошибки 5xx пишутся в журнал
 * с маскированием персональных данных.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Необработанная ошибка',
        exception instanceof Error ? exception.stack : undefined,
        'HttpExceptionFilter',
      );
    }
    if (!res.headersSent) res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const raw =
        typeof response === 'string' ? response : (response as { message?: unknown }).message;
      const message =
        typeof raw === 'string' && CYRILLIC.test(raw)
          ? raw
          : (DEFAULT_MESSAGES[statusCode] ?? DEFAULT_MESSAGES[500]!);
      const fields =
        typeof response === 'object'
          ? (response as { fields?: Record<string, string> }).fields
          : undefined;
      return fields ? { statusCode, message, fields } : { statusCode, message };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERRORS[exception.code];
      if (mapped) return { statusCode: mapped.status, message: mapped.message };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: DEFAULT_MESSAGES[500]! };
  }
}
