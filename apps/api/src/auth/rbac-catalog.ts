import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  Permission,
  PERMISSION_DESCRIPTIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  RoleCode,
} from '@iot/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Приводит таблицы roles, permissions, role_permissions к каталогу из `@iot/shared`.
 * Идемпотентна: вызывается при каждом запуске API и в сиде. Системные роли в интерфейсе
 * не редактируются, поэтому каталог в коде — единственный источник наборов прав.
 */
export async function syncRbacCatalog(prisma: PrismaClient): Promise<void> {
  const codes = Object.values(Permission);
  await prisma.$transaction(async (tx) => {
    for (const code of codes) {
      await tx.permission.upsert({
        where: { code },
        create: { code, description: PERMISSION_DESCRIPTIONS[code] },
        update: { description: PERMISSION_DESCRIPTIONS[code] },
      });
    }
    await tx.permission.deleteMany({ where: { code: { notIn: codes } } });
    const permissionIds = new Map(
      (await tx.permission.findMany()).map((permission) => [permission.code, permission.id]),
    );

    for (const code of Object.values(RoleCode)) {
      const role = await tx.role.upsert({
        where: { code },
        create: {
          code,
          name: ROLE_LABELS[code],
          description: ROLE_DESCRIPTIONS[code],
          isSystem: true,
        },
        update: { name: ROLE_LABELS[code], description: ROLE_DESCRIPTIONS[code], isSystem: true },
      });
      const wanted = ROLE_PERMISSIONS[code].map((permission) => permissionIds.get(permission)!);
      await tx.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wanted } },
      });
      await tx.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  });
}

@Injectable()
export class RbacCatalogSync implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await syncRbacCatalog(this.prisma);
  }
}
