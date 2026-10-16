import type { CurrentUser, Permission, RoleCode } from '@iot/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Выборка пользователя с ролями и действующими индивидуальными разрешениями. */
export function currentUserInclude(now: Date) {
  return {
    roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    permissions: {
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      include: { permission: true },
    },
  } satisfies Prisma.UserInclude;
}

type UserWithAccess = Prisma.UserGetPayload<{ include: ReturnType<typeof currentUserInclude> }>;

/** Эффективные права = права ролей ∪ действующие индивидуальные разрешения. */
export function toCurrentUser(user: UserWithAccess): CurrentUser {
  const permissions = new Set<string>();
  for (const { role } of user.roles) {
    for (const { permission } of role.permissions) permissions.add(permission.code);
  }
  for (const { permission } of user.permissions) permissions.add(permission.code);
  return {
    id: user.id,
    login: user.login,
    lastName: user.lastName,
    firstName: user.firstName,
    middleName: user.middleName,
    roles: user.roles.map(({ role }) => role.code as RoleCode).sort(),
    permissions: [...permissions].sort() as Permission[],
    mustChangePassword: user.mustChangePassword,
  };
}
