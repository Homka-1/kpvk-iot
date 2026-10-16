import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CSRF_COOKIE, CSRF_HEADER, type RoleCode, type SessionResponse } from '@iot/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/passwords.js';
import type { AppLogger } from '../src/logging/app-logger.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export async function createTestApp(logger?: AppLogger): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, logger);
  await app.init();
  return app;
}

/** Уникальный логин: тестовая база общая для запусков. */
export function uniqueLogin(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

export const TEST_PASSWORD = 'Тестовый-пароль-2026';

export async function createUser(
  app: INestApplication,
  options: {
    role: RoleCode;
    login?: string;
    password?: string;
    lastName?: string;
    mustChangePassword?: boolean;
  },
) {
  const prisma = app.get(PrismaService);
  const role = await prisma.role.findUniqueOrThrow({ where: { code: options.role } });
  const login = options.login ?? uniqueLogin(options.role);
  const user = await prisma.user.create({
    data: {
      login,
      lastName: options.lastName ?? 'Тестов',
      firstName: 'Тест',
      passwordHash: await hashPassword(options.password ?? TEST_PASSWORD),
      mustChangePassword: options.mustChangePassword ?? false,
      roles: { create: { roleId: role.id } },
    },
  });
  return { ...user, password: options.password ?? TEST_PASSWORD };
}

export interface LoggedIn {
  accessToken: string;
  csrf: string;
  /** Cookie для запросов refresh/logout. */
  cookies: string[];
  body: SessionResponse;
}

export function parseCookies(setCookie: string[] | string | undefined): Record<string, string> {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return Object.fromEntries(
    list.map((cookie) => {
      const [pair] = cookie.split(';');
      const index = pair!.indexOf('=');
      return [pair!.slice(0, index), pair!.slice(index + 1)];
    }),
  );
}

export async function login(
  app: INestApplication,
  loginName: string,
  password = TEST_PASSWORD,
): Promise<LoggedIn> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ login: loginName, password })
    .expect(200);
  return sessionFrom(res);
}

export function sessionFrom(res: request.Response): LoggedIn {
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const cookies = parseCookies(setCookie);
  return {
    accessToken: (res.body as SessionResponse).accessToken,
    csrf: cookies[CSRF_COOKIE]!,
    cookies: Object.entries(cookies).map(([name, value]) => `${name}=${value}`),
    body: res.body as SessionResponse,
  };
}

export function withCsrf(req: request.Test, session: LoggedIn): request.Test {
  return req.set('Cookie', session.cookies).set(CSRF_HEADER, session.csrf);
}
