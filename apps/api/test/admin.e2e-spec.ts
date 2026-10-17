import type { INestApplication } from '@nestjs/common';
import { Permission, RoleCode } from '@iot/shared';
import request from 'supertest';
import { AccessScopeService } from '../src/auth/access-scope.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn, uniqueLogin } from './helpers.js';

describe('Администрирование и права (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let adminSession: LoggedIn;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createUser(app, { role: RoleCode.ADMIN });
    adminSession = await login(app, admin.login);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.auth(adminSession.accessToken, { type: 'bearer' });

  it('AT-12, п. 2: эндпоинты администрирования отвечают 403 преподавателю, студенту и исследователю', async () => {
    for (const role of [RoleCode.TEACHER, RoleCode.STUDENT, RoleCode.RESEARCHER]) {
      const user = await createUser(app, { role });
      const { accessToken } = await login(app, user.login);
      for (const path of [
        '/api/admin/users',
        '/api/admin/roles',
        '/api/audit-logs',
        '/api/settings',
      ]) {
        const res = await http().get(path).auth(accessToken, { type: 'bearer' }).expect(403);
        expect(res.body.message).toBe('Недостаточно прав для выполнения действия');
      }
    }
    await http().get('/api/admin/users').expect(401);
  });

  it('MVP-1: администратор создаёт сотрудника; временный пароль нужно сменить до начала работы', async () => {
    const loginName = uniqueLogin('new.teacher');
    const created = await asAdmin(http().post('/api/admin/users'))
      .send({ login: loginName, lastName: 'Сидорова', firstName: 'Мария', roles: ['teacher'] })
      .expect(201);
    expect(created.body.user).toMatchObject({
      login: loginName,
      roles: ['teacher'],
      mustChangePassword: true,
    });
    expect(created.body.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);

    // Повторная отправка формы не создаёт дубль (NFR-006).
    const duplicate = await asAdmin(http().post('/api/admin/users'))
      .send({ login: loginName, lastName: 'Сидорова', firstName: 'Мария', roles: ['teacher'] })
      .expect(409);
    expect(duplicate.body.message).toBe('Пользователь с таким логином уже существует');

    const session = await login(app, loginName, created.body.temporaryPassword);
    expect(session.body.user.mustChangePassword).toBe(true);
    const blocked = await http()
      .get('/api/admin/permissions')
      .auth(session.accessToken, { type: 'bearer' })
      .expect(403);
    expect(blocked.body.message).toBe('Смените временный пароль, чтобы продолжить работу');

    const changed = await http()
      .post('/api/auth/change-password')
      .auth(session.accessToken, { type: 'bearer' })
      .send({ currentPassword: created.body.temporaryPassword, newPassword: 'Мой-пароль-2026' })
      .expect(200);
    expect(changed.body.mustChangePassword).toBe(false);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.created', entityId: created.body.user.id },
    });
    expect(audit.actorId).toBe(admin.id);
    expect(JSON.stringify(audit.after)).not.toContain(created.body.temporaryPassword);
  });

  it('п. 8.3: создание студента и неизвестной роли через администрирование отклоняется', async () => {
    const res = await asAdmin(http().post('/api/admin/users'))
      .send({ login: uniqueLogin('x'), lastName: 'А', firstName: 'Б', roles: ['student'] })
      .expect(400);
    expect(res.body.fields.roles).toBe('Эту роль нельзя назначить в разделе «Администрирование»');
  });

  it('блокировка завершает сессии сразу, вход заблокированного — 403; разблокировка возвращает доступ', async () => {
    const user = await createUser(app, { role: RoleCode.TEACHER });
    const session = await login(app, user.login);

    await asAdmin(http().post(`/api/admin/users/${user.id}/block`))
      .send({})
      .expect(400);
    const blocked = await asAdmin(http().post(`/api/admin/users/${user.id}/block`))
      .send({ reason: 'Увольнение' })
      .expect(200);
    expect(blocked.body.status).toBe('BLOCKED');

    await http().get('/api/auth/me').auth(session.accessToken, { type: 'bearer' }).expect(401);
    const res = await http()
      .post('/api/auth/login')
      .send({ login: user.login, password: user.password })
      .expect(403);
    expect(res.body.message).toBe('Учётная запись заблокирована. Обратитесь к администратору');

    await asAdmin(http().post(`/api/admin/users/${user.id}/unblock`)).expect(200);
    await login(app, user.login);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.blocked', entityId: user.id },
    });
    expect(entry.reason).toBe('Увольнение');
  });

  it('сброс пароля выдаёт временный пароль и завершает сессии', async () => {
    const user = await createUser(app, { role: RoleCode.RESEARCHER });
    const session = await login(app, user.login);
    const res = await asAdmin(http().post(`/api/admin/users/${user.id}/reset-password`)).expect(
      200,
    );
    expect(res.body.user.mustChangePassword).toBe(true);
    await http().get('/api/auth/me').auth(session.accessToken, { type: 'bearer' }).expect(401);
    await login(app, user.login, res.body.temporaryPassword);
  });

  it('п. 2.1: администратор не может изменить собственные роли и выдать себе разрешения', async () => {
    const roles = await asAdmin(http().put(`/api/admin/users/${admin.id}/roles`))
      .send({ roles: ['admin', 'teacher'] })
      .expect(403);
    expect(roles.body.message).toMatch(/Собственные роли/);
    await asAdmin(http().post(`/api/admin/users/${admin.id}/permissions`))
      .send({ permission: Permission.DIAGNOSTIC_ANSWERS_READ, reason: 'Хочу посмотреть' })
      .expect(403);
    await asAdmin(http().post(`/api/admin/users/${admin.id}/block`))
      .send({ reason: 'Тест' })
      .expect(403);

    const me = await http().get('/api/auth/me').auth(adminSession.accessToken, { type: 'bearer' });
    expect(me.body.permissions).not.toContain(Permission.DIAGNOSTIC_ANSWERS_READ);
  });

  it('п. 2.4: разрешение на ПДн выдаётся исследователю индивидуально с основанием и отзывается', async () => {
    const researcher = await createUser(app, { role: RoleCode.RESEARCHER });
    const session = await login(app, researcher.login);
    const before = await http().get('/api/auth/me').auth(session.accessToken, { type: 'bearer' });
    expect(before.body.permissions).not.toContain(Permission.RESEARCH_PERSONAL_DATA_READ);

    const granted = await asAdmin(http().post(`/api/admin/users/${researcher.id}/permissions`))
      .send({
        permission: Permission.RESEARCH_PERSONAL_DATA_READ,
        reason: 'Приказ № 12 от 01.10.2026',
      })
      .expect(200);
    expect(granted.body.grantedPermissions).toEqual([
      expect.objectContaining({
        permission: 'research.personal_data.read',
        reason: 'Приказ № 12 от 01.10.2026',
      }),
    ]);
    const after = await http().get('/api/auth/me').auth(session.accessToken, { type: 'bearer' });
    expect(after.body.permissions).toContain(Permission.RESEARCH_PERSONAL_DATA_READ);

    await asAdmin(
      http().delete(
        `/api/admin/users/${researcher.id}/permissions/${Permission.RESEARCH_PERSONAL_DATA_READ}`,
      ),
    )
      .send({ reason: 'Исследование завершено' })
      .expect(200);
    const revoked = await http().get('/api/auth/me').auth(session.accessToken, { type: 'bearer' });
    expect(revoked.body.permissions).not.toContain(Permission.RESEARCH_PERSONAL_DATA_READ);

    const actions = await prisma.auditLog.findMany({
      where: { entityId: researcher.id, action: { startsWith: 'user.permission_' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => [a.action, a.reason])).toEqual([
      ['user.permission_granted', 'Приказ № 12 от 01.10.2026'],
      ['user.permission_revoked', 'Исследование завершено'],
    ]);
  });

  it('учётные записи студентов не изменяются через администрирование', async () => {
    const student = await createUser(app, { role: RoleCode.STUDENT });
    await asAdmin(http().put(`/api/admin/users/${student.id}/roles`))
      .send({ roles: ['teacher'] })
      .expect(409);
    await asAdmin(http().post(`/api/admin/users/${student.id}/permissions`))
      .send({ permission: Permission.STUDENTS_READ, reason: 'Тест' })
      .expect(409);
  });

  it('список пользователей: поиск, фильтр по роли, 404 для несуществующего', async () => {
    // Тестовая БД общая для прогонов: фамилия уникальна в каждом прогоне, иначе найденные
    // пользователи прежних прогонов вытесняют нового с первой страницы списка.
    const lastName = `Уникальнова${Array.from({ length: 6 }, () => 'абвгдежзик'[Math.floor(Math.random() * 10)]).join('')}`;
    const user = await createUser(app, { role: RoleCode.RESEARCHER, lastName });
    const res = await asAdmin(http().get('/api/admin/users'))
      .query({ search: lastName.toLowerCase(), role: 'researcher' })
      .expect(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toContain(user.id);
    await asAdmin(http().get('/api/admin/users/00000000-0000-7000-8000-000000000000')).expect(404);
    await asAdmin(http().get('/api/admin/users/not-a-uuid')).expect(404);
  });

  it('роли и каталог разрешений: у администратора нет доступа к ответам диагностики', async () => {
    const roles = await asAdmin(http().get('/api/admin/roles')).expect(200);
    const adminRole = roles.body.find((role: { code: string }) => role.code === 'admin');
    expect(adminRole.permissions).not.toContain(Permission.DIAGNOSTIC_ANSWERS_READ);
    const permissions = await asAdmin(http().get('/api/admin/permissions')).expect(200);
    expect(permissions.body).toContainEqual(
      expect.objectContaining({ code: Permission.DIAGNOSTIC_ANSWERS_READ, sensitive: true }),
    );
  });

  it('п. 8.3: журнал аудита доступен администратору с фильтрами', async () => {
    const res = await asAdmin(http().get('/api/audit-logs'))
      .query({ action: 'auth.login', actorId: admin.id })
      .expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.items[0]).toMatchObject({ action: 'auth.login', actorName: 'Тестов Тест' });
  });

  it('настройки: проверка значений, изменение пишется в аудит', async () => {
    const list = await asAdmin(http().get('/api/settings')).expect(200);
    const attempts = list.body.find((s: { key: string }) => s.key === 'auth.maxFailedAttempts');
    expect(attempts).toMatchObject({ value: 5, min: 3, max: 20 });

    const invalid = await asAdmin(http().patch('/api/settings'))
      .send({ 'auth.maxFailedAttempts': 100, 'unknown.key': 1 })
      .expect(400);
    expect(invalid.body.fields).toEqual({
      'auth.maxFailedAttempts': 'Укажите целое число от 3 до 20',
      'unknown.key': 'Неизвестная настройка',
    });

    try {
      const updated = await asAdmin(http().patch('/api/settings'))
        .send({ 'auth.sessionDays': 3 })
        .expect(200);
      expect(updated.body.find((s: { key: string }) => s.key === 'auth.sessionDays').value).toBe(3);
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'settings.updated', actorId: admin.id },
      });
      expect(entry.after).toEqual({ 'auth.sessionDays': 3 });
    } finally {
      await asAdmin(http().patch('/api/settings')).send({ 'auth.sessionDays': 7 }).expect(200);
    }
  });

  it('FR-002: область данных преподавателя — только закреплённые группы и дисциплины', async () => {
    const teacher = await createUser(app, { role: RoleCode.TEACHER });
    const suffix = uniqueLogin('g');
    const [own, foreign] = await Promise.all(
      ['own', 'foreign'].map((name) =>
        prisma.group.create({ data: { name: `${name}-${suffix}`, course: 1, specialty: 'Тест' } }),
      ),
    );
    const discipline = await prisma.discipline.create({ data: { name: `Дисциплина ${suffix}` } });
    await prisma.teacherAssignment.create({
      data: { teacherId: teacher.id, groupId: own!.id, disciplineId: discipline.id },
    });
    const ended = new Date(Date.now() - 1000);
    await prisma.teacherAssignment.create({
      data: {
        teacherId: teacher.id,
        groupId: foreign!.id,
        disciplineId: discipline.id,
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: ended,
      },
    });

    const scopes = app.get(AccessScopeService);
    const teacherSession = await login(app, teacher.login);
    const { body: teacherMe } = await http()
      .get('/api/auth/me')
      .auth(teacherSession.accessToken, { type: 'bearer' });
    const scope = await scopes.forUser(teacherMe);
    expect(scope).toEqual({
      kind: 'assigned',
      groupIds: [own!.id],
      disciplineIds: [discipline.id],
      pairs: [{ groupId: own!.id, disciplineId: discipline.id }],
    });
    expect(scopes.studentsWhere(scope)).toEqual({ currentGroupId: { in: [own!.id] } });

    const { body: adminMe } = await http()
      .get('/api/auth/me')
      .auth(adminSession.accessToken, { type: 'bearer' });
    expect(await scopes.forUser(adminMe)).toEqual({ kind: 'all' });
  });
});
