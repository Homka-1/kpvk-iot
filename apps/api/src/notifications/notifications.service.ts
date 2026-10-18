import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type CurrentUser,
  type NotificationDto,
  NOTIFICATIONS_LIST_LIMIT,
  type NotificationsDto,
} from '@iot/shared';
import { activeAssignmentWhere } from '../auth/access-scope.service.js';
import type { Notification, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface NotificationInput {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

const toDto = (row: Notification): NotificationDto => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Внутрисистемные уведомления (FR-065): список и счётчик непрочитанных для бейджа в шапке,
 * отметка о прочтении. Каждый пользователь видит только свои уведомления.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: CurrentUser): Promise<NotificationsDto> {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: NOTIFICATIONS_LIST_LIMIT,
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items: items.map(toDto), unread };
  }

  async markRead(user: CurrentUser, id: string): Promise<NotificationDto> {
    const row = await this.prisma.notification.findFirst({ where: { id, userId: user.id } });
    if (!row) throw new NotFoundException('Уведомление не найдено');
    if (row.readAt) return toDto(row);
    return toDto(
      await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } }),
    );
  }

  async markAllRead(user: CurrentUser): Promise<NotificationsDto> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return this.list(user);
  }

  /** Уведомление нескольким получателям в транзакции записи, которая его вызвала. */
  async notify(
    tx: Prisma.TransactionClient,
    userIds: (string | null | undefined)[],
    input: NotificationInput,
  ): Promise<void> {
    const recipients = [...new Set(userIds.filter((id): id is string => !!id))];
    if (recipients.length === 0) return;
    await tx.notification.createMany({
      data: recipients.map((userId) => ({ userId, ...input })),
    });
  }

  /**
   * Преподаватели, которым адресовано обращение студента: преподаватель ИОТ, если обращение
   * относится к маршруту, иначе преподаватели действующих закреплений группы студента.
   */
  async teachersFor(
    tx: Prisma.TransactionClient,
    studentId: string,
    trajectoryId: string | null,
  ): Promise<string[]> {
    if (trajectoryId) {
      const trajectory = await tx.trajectory.findUnique({
        where: { id: trajectoryId },
        select: { teacherId: true },
      });
      if (trajectory) return [trajectory.teacherId];
    }
    const student = await tx.student.findUnique({
      where: { id: studentId },
      select: { currentGroupId: true },
    });
    if (!student?.currentGroupId) return [];
    const assignments = await tx.teacherAssignment.findMany({
      where: { groupId: student.currentGroupId, ...activeAssignmentWhere() },
      select: { teacherId: true },
    });
    return [...new Set(assignments.map((item) => item.teacherId))];
  }
}
