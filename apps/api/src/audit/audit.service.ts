import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../common/request-context.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEntry {
  /** Код действия: `<сущность>.<действие>`, например `user.blocked`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
  /** По умолчанию — пользователь текущего запроса. */
  actorId?: string | null;
}

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Журнал аудита (п. 8.3 ТЗ). Запись делается в той же транзакции, что и изменение,
 * поэтому изменение без записи в журнале невозможно. Записи неизменяемы (триггер в БД).
 * Пароли, токены и хеши в журнал не передаются.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    const context = getRequestContext();
    await db.auditLog.create({
      data: {
        actorId: entry.actorId === undefined ? (context?.userId ?? null) : entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: entry.before ?? Prisma.DbNull,
        after: entry.after ?? Prisma.DbNull,
        reason: entry.reason ?? null,
        ipAddress: context?.ipAddress ?? null,
      },
    });
  }
}
