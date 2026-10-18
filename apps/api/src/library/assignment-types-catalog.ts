import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { SYSTEM_ASSIGNMENT_TYPES } from '@iot/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Стандартные типы заданий п. 4.7 ТЗ в таблице assignment_types. Идемпотентна: вызывается
 * при запуске API и в сиде. Типы, добавленные пользователями, не затрагиваются.
 */
export async function syncAssignmentTypes(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const type of SYSTEM_ASSIGNMENT_TYPES) {
      await tx.assignmentType.upsert({
        where: { code: type.code },
        create: { code: type.code, name: type.name, isSystem: true },
        update: { name: type.name, isSystem: true },
      });
    }
  });
}

@Injectable()
export class AssignmentTypesCatalogSync implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await syncAssignmentTypes(this.prisma);
  }
}
