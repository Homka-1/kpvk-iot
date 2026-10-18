import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

/** Значение заголовка `Idempotency-Key`; обязателен для форм, создающих записи (NFR-006). */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const value = ctx.switchToHttp().getRequest<Request>().headers[IDEMPOTENCY_HEADER];
  if (typeof value !== 'string' || !KEY_PATTERN.test(value)) {
    throw new BadRequestException(
      'Не передан ключ повторной отправки (заголовок Idempotency-Key). Обновите страницу и повторите',
    );
  }
  return value;
});

export interface IdempotentResult<T> {
  response: T;
  replayed: boolean;
}

/**
 * Защита от повторной отправки формы (NFR-006). Первый запрос с ключом выполняется и сохраняет
 * ответ; повтор с тем же ключом и теми же данными возвращает сохранённый ответ без новых записей.
 * Секреты (временные пароли) в сохранённый ответ не попадают: их убирает `toStored`.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    userId: string,
    key: string,
    request: unknown,
    action: () => Promise<T>,
    toStored: (response: T) => T = (response) => response,
  ): Promise<IdempotentResult<T>> {
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const now = new Date();
    await this.prisma.idempotencyKey.deleteMany({
      where: { userId, key, expiresAt: { lte: now } },
    });

    let recordId: string;
    try {
      const record = await this.prisma.idempotencyKey.create({
        data: { userId, key, requestHash, expiresAt: new Date(now.getTime() + TTL_MS) },
      });
      recordId = record.id;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const existing = await this.prisma.idempotencyKey.findUniqueOrThrow({
        where: { userId_key: { userId, key } },
      });
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Ключ повторной отправки уже использован для других данных. Обновите страницу',
        );
      }
      if (existing.responseBody === null) {
        throw new ConflictException('Запрос уже выполняется. Дождитесь завершения');
      }
      return { response: existing.responseBody as T, replayed: true };
    }

    try {
      const response = await action();
      await this.prisma.idempotencyKey.update({
        where: { id: recordId },
        data: {
          responseStatus: 201,
          responseBody: JSON.parse(JSON.stringify(toStored(response))) as Prisma.InputJsonValue,
        },
      });
      return { response, replayed: false };
    } catch (error) {
      // Неудачный запрос можно повторить с тем же ключом.
      await this.prisma.idempotencyKey.delete({ where: { id: recordId } }).catch(() => undefined);
      throw error;
    }
  }
}

/** Описание заголовка `Idempotency-Key` для OpenAPI. */
export const ApiIdempotencyHeader = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Ключ формы (8–100 символов): повторная отправка с тем же ключом не создаёт дублей (NFR-006)',
  });
