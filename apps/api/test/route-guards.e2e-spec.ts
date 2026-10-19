import type { INestApplication } from '@nestjs/common';
import { Permission } from '@iot/shared';
import request from 'supertest';
import { createTestApp } from './helpers.js';
import { collectRoutes, type RouteInfo } from './routes.js';

/** Маршруты без входа. Новый публичный маршрут — только осознанно, с правкой этого списка. */
const PUBLIC_ROUTES = [
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/refresh',
];

/**
 * Маршруты, которым достаточно входа без отдельного разрешения: они работают только
 * с данными самого пользователя (своя учётная запись, свои уведомления).
 */
const SELF_ONLY_ROUTES = [
  'GET /api/auth/me',
  'GET /api/auth/password-policy',
  'GET /api/notifications',
  'POST /api/auth/change-password',
  'POST /api/notifications/:id/read',
  'POST /api/notifications/read-all',
];

describe('Ревизия прав маршрутов (e2e)', () => {
  let app: INestApplication;
  let routes: RouteInfo[];

  beforeAll(async () => {
    app = await createTestApp();
    routes = collectRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('п. 8.3: маршруты найдены (проверка самого обхода)', () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  it('п. 8.3: без входа доступны только вход, обновление сессии, выход и health', () => {
    expect(routes.filter((r) => r.isPublic).map((r) => r.key)).toEqual(PUBLIC_ROUTES);
  });

  it('п. 8.3, FR-002: каждый непубличный маршрут требует разрешения, кроме работы со своими данными', () => {
    const withoutPermissions = routes
      .filter((r) => !r.isPublic && !r.permissions.length && !r.anyPermissions.length)
      .map((r) => r.key);
    expect(withoutPermissions).toEqual(SELF_ONLY_ROUTES);
  });

  it('AT-12: маршруты кабинета студента требуют права кабинета, а служебные — недоступны по нему одному', () => {
    const cabinet = routes.filter((r) => r.path.startsWith('/api/cabinet'));
    expect(cabinet.length).toBeGreaterThan(10);
    for (const route of cabinet) {
      expect({ route: route.key, permissions: route.permissions }).toEqual({
        route: route.key,
        permissions: [Permission.CABINET_ACCESS],
      });
    }
    // Ни один служебный маршрут не открывается одним правом кабинета.
    const staffOpenToCabinet = routes.filter(
      (r) =>
        !r.path.startsWith('/api/cabinet') && r.anyPermissions.includes(Permission.CABINET_ACCESS),
    );
    expect(staffOpenToCabinet.map((r) => r.key)).toEqual([]);
  });

  it('п. 8.3: каждый непубличный маршрут без токена отвечает 401', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const failures: string[] = [];
    for (const route of routes.filter((r) => !r.isPublic)) {
      const url = route.path.replace(/:[A-Za-z]+/g, id);
      const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
      const res = await request(app.getHttpServer())[method](url).send({});
      if (res.status !== 401) failures.push(`${route.key} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});
