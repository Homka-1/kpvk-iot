import type { INestApplication } from '@nestjs/common';
import { FILE_UPLOAD_MAX_BYTES, RoleCode } from '@iot/shared';
import request from 'supertest';
import { IdempotencyCleanupService } from '../src/common/idempotency-cleanup.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

describe('Безопасность транспорта, ошибки и хранение служебных данных (e2e)', () => {
  let app: INestApplication;
  let teacher: LoggedIn;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);
  });

  afterAll(async () => {
    await app.close();
  });

  it('п. 8.3: ответы API несут заголовки безопасности и CSP, без X-Powered-By', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).toContain("object-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('п. 8.3: ответы с данными не кэшируются браузером и прокси', async () => {
    const res = await http()
      .get('/api/auth/me')
      .auth(teacher.accessToken, { type: 'bearer' })
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('п. 8.3: документация API открывается при включённой CSP', async () => {
    const res = await http().get('/api/docs/').expect(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('NFR-005: слишком большое тело запроса — 413 с понятным сообщением', async () => {
    const res = await http()
      .post('/api/questionnaires')
      .auth(teacher.accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ content: { title: 'x'.repeat(3 * 1024 * 1024) } }))
      .expect(413);
    expect(res.body).toEqual({
      statusCode: 413,
      message: 'Слишком большой запрос',
    });
  });

  it('NFR-005: некорректный JSON — 400 с понятным сообщением', async () => {
    const res = await http()
      .post('/api/questionnaires')
      .auth(teacher.accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/json')
      .send('{"content":')
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, message: 'Некорректный запрос' });
  });

  it('NFR-005, п. 8.3: файл больше лимита — 413 с русским сообщением', async () => {
    const res = await http()
      .post('/api/files')
      .auth(teacher.accessToken, { type: 'bearer' })
      .attach('file', Buffer.alloc(FILE_UPLOAD_MAX_BYTES + 1, 0x20), 'big.txt')
      .expect(413);
    expect(res.body.message).toMatch(/[А-Яа-я]/);
  });

  it('NFR-005: неизвестный маршрут — 404 с понятным сообщением', async () => {
    const res = await http().get('/api/unknown-route').expect(404);
    expect(res.body).toEqual({ statusCode: 404, message: 'Запрошенные данные не найдены' });
  });

  it('NFR-006, п. 8.3: просроченные ключи повторной отправки удаляются вместе с сохранёнными ответами', async () => {
    const prisma = app.get(PrismaService);
    const userId = teacher.body.user.id;
    const now = new Date();
    const expired = await prisma.idempotencyKey.create({
      data: {
        userId,
        key: `expired-${now.getTime()}`,
        requestHash: 'x',
        responseBody: { fullName: 'Персональные данные' },
        expiresAt: new Date(now.getTime() - 1000),
      },
    });
    const active = await prisma.idempotencyKey.create({
      data: {
        userId,
        key: `active-${now.getTime()}`,
        requestHash: 'x',
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });
    expect(await app.get(IdempotencyCleanupService).run(now)).toBeGreaterThanOrEqual(1);
    expect(await prisma.idempotencyKey.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.idempotencyKey.findUnique({ where: { id: active.id } })).not.toBeNull();
  });
});
