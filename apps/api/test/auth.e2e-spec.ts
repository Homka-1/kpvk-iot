import type { INestApplication } from '@nestjs/common';
import { Permission, RoleCode } from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  createUser,
  login,
  parseCookies,
  sessionFrom,
  TEST_PASSWORD,
  uniqueLogin,
  withCsrf,
} from './helpers.js';

describe('Авторизация (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('MVP-1: вход выдаёт access-токен, httpOnly refresh-cookie и CSRF-cookie; вход пишется в аудит', async () => {
    const user = await createUser(app, { role: RoleCode.TEACHER });
    const res = await http()
      .post('/api/auth/login')
      .send({ login: user.login.toUpperCase(), password: TEST_PASSWORD })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ login: user.login, roles: ['teacher'] });
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(setCookie).toMatch(/iot_refresh=[^;]+;.*HttpOnly/);
    expect(setCookie).toMatch(/iot_refresh=[^;]+;.*SameSite=Strict/);
    expect(setCookie).toMatch(/iot_refresh=[^;]+;.*Path=\/api\/auth/);
    expect(setCookie).toMatch(/iot_csrf=[^;]+/);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'auth.login', entityId: user.id },
    });
    expect(audit?.actorId).toBe(user.id);

    const session = await prisma.authSession.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.tokenHash).not.toBe(parseCookies(res.headers['set-cookie'])['iot_refresh']);
  });

  it('п. 8.3: неверный пароль и неизвестный логин дают одинаковый ответ 401', async () => {
    const user = await createUser(app, { role: RoleCode.TEACHER });
    const wrong = await http()
      .post('/api/auth/login')
      .send({ login: user.login, password: 'неверный-пароль-1' })
      .expect(401);
    const unknown = await http()
      .post('/api/auth/login')
      .send({ login: uniqueLogin('nobody'), password: 'неверный-пароль-1' })
      .expect(401);
    expect(wrong.body).toEqual({ statusCode: 401, message: 'Неверный логин или пароль' });
    expect(unknown.body).toEqual(wrong.body);
  });

  it('NFR-005: ошибки проверки формы возвращаются по полям на русском', async () => {
    const res = await http().post('/api/auth/login').send({ login: '' }).expect(400);
    expect(res.body.message).toBe('Проверьте правильность заполнения формы');
    expect(res.body.fields).toMatchObject({ login: 'Введите логин', password: 'Введите пароль' });
  });

  it('п. 8.3: после 5 неверных паролей вход блокируется даже с верным паролем', async () => {
    const user = await createUser(app, { role: RoleCode.TEACHER });
    for (let attempt = 1; attempt <= 4; attempt++) {
      await http()
        .post('/api/auth/login')
        .send({ login: user.login, password: 'неверный-пароль-1' })
        .expect(401);
    }
    const locked = await http()
      .post('/api/auth/login')
      .send({ login: user.login, password: 'неверный-пароль-1' })
      .expect(423);
    expect(locked.body.message).toMatch(/временно заблокирован.*15 мин/);

    await http()
      .post('/api/auth/login')
      .send({ login: user.login, password: TEST_PASSWORD })
      .expect(423);

    const events = await prisma.auditLog.findMany({
      where: { entityId: user.id, action: { in: ['auth.login_failed', 'auth.locked'] } },
    });
    expect(events.filter((event) => event.action === 'auth.login_failed')).toHaveLength(4);
    expect(events.filter((event) => event.action === 'auth.locked')).toHaveLength(1);
  });

  it('п. 8.3: обновление сессии требует CSRF-токен и ротирует refresh-токен', async () => {
    const user = await createUser(app, { role: RoleCode.TEACHER });
    const session = await login(app, user.login);

    await http().post('/api/auth/refresh').set('Cookie', session.cookies).expect(403);
    await http()
      .post('/api/auth/refresh')
      .set('Cookie', session.cookies)
      .set('x-csrf-token', 'forged-token')
      .expect(403);

    const refreshed = await withCsrf(http().post('/api/auth/refresh'), session).expect(200);
    expect(refreshed.body.user.id).toBe(user.id);
    const next = sessionFrom(refreshed);

    // Старый refresh-токен после ротации не действует.
    await withCsrf(http().post('/api/auth/refresh'), session).expect(401);
    await withCsrf(http().post('/api/auth/refresh'), next).expect(200);
  });

  it('MVP-1: выход завершает сессию — refresh и выданный access-токен больше не действуют', async () => {
    const user = await createUser(app, { role: RoleCode.TEACHER });
    const session = await login(app, user.login);
    await http().get('/api/auth/me').auth(session.accessToken, { type: 'bearer' }).expect(200);

    await withCsrf(http().post('/api/auth/logout'), session).expect(204);
    await withCsrf(http().post('/api/auth/refresh'), session).expect(401);
    const res = await http()
      .get('/api/auth/me')
      .auth(session.accessToken, { type: 'bearer' })
      .expect(401);
    expect(res.body.message).toBe('Сессия завершена. Войдите снова');
  });

  it('401 без токена и с поддельным токеном', async () => {
    await http().get('/api/auth/me').expect(401);
    await http().get('/api/auth/me').auth('not-a-jwt', { type: 'bearer' }).expect(401);
  });

  it('смена пароля: проверяет текущий пароль и политику, завершает другие сессии', async () => {
    const user = await createUser(app, { role: RoleCode.RESEARCHER });
    const first = await login(app, user.login);
    const second = await login(app, user.login);

    const wrongCurrent = await http()
      .post('/api/auth/change-password')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ currentPassword: 'не-тот-пароль-1', newPassword: 'Новый-пароль-2026' })
      .expect(400);
    expect(wrongCurrent.body.fields.currentPassword).toBe('Текущий пароль указан неверно');

    const weak = await http()
      .post('/api/auth/change-password')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short1' })
      .expect(400);
    expect(weak.body.fields.newPassword).toMatch(/не менее 10 символов/);

    await http()
      .post('/api/auth/change-password')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Новый-пароль-2026' })
      .expect(200);

    await http().get('/api/auth/me').auth(first.accessToken, { type: 'bearer' }).expect(200);
    await http().get('/api/auth/me').auth(second.accessToken, { type: 'bearer' }).expect(401);
    await login(app, user.login, 'Новый-пароль-2026');
    expect(
      await prisma.auditLog.count({
        where: { action: 'auth.password_changed', entityId: user.id },
      }),
    ).toBe(1);
  });

  it('п. 2.1: роль администратора не даёт доступа к диагностическим ответам', async () => {
    const admin = await createUser(app, { role: RoleCode.ADMIN });
    const session = await login(app, admin.login);
    const me = await http().get('/api/auth/me').auth(session.accessToken, { type: 'bearer' });
    expect(me.body.permissions).toContain(Permission.USERS_MANAGE);
    expect(me.body.permissions).not.toContain(Permission.DIAGNOSTIC_ANSWERS_READ);
    expect(me.body.permissions).not.toContain(Permission.RESEARCH_PERSONAL_DATA_READ);
  });
});
