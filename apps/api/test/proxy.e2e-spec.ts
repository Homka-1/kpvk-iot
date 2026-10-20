import type { INestApplication } from '@nestjs/common';
import { RoleCode } from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, TEST_PASSWORD } from './helpers.js';

/** Адрес клиента последней сессии пользователя: его видят ограничение входа и журнал. */
async function lastSessionIp(app: INestApplication, userId: string): Promise<string | null> {
  const session = await app
    .get(PrismaService)
    .authSession.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return session.ipAddress;
}

async function loginFrom(app: INestApplication, loginName: string, forwardedFor: string) {
  await request(app.getHttpServer())
    .post('/api/auth/login')
    .set('X-Forwarded-For', forwardedFor)
    .send({ login: loginName, password: TEST_PASSWORD })
    .expect(200);
}

describe('Работа за обратным прокси (e2e)', () => {
  const previous = process.env.TRUST_PROXY;

  afterEach(() => {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  });

  it('п. 8.3: без TRUST_PROXY заголовок X-Forwarded-For от клиента не учитывается', async () => {
    delete process.env.TRUST_PROXY;
    const app = await createTestApp();
    try {
      const user = await createUser(app, { role: RoleCode.TEACHER });
      await loginFrom(app, user.login, '203.0.113.7');
      expect(await lastSessionIp(app, user.id)).not.toBe('203.0.113.7');
    } finally {
      await app.close();
    }
  });

  it('п. 8.3: с TRUST_PROXY=1 адрес клиента берётся у прокси, подделка левее не учитывается', async () => {
    process.env.TRUST_PROXY = '1';
    const app = await createTestApp();
    try {
      const user = await createUser(app, { role: RoleCode.TEACHER });
      // Клиент прислал свой заголовок, nginx дописал к нему настоящий адрес справа.
      await loginFrom(app, user.login, '198.51.100.1, 203.0.113.7');
      expect(await lastSessionIp(app, user.id)).toBe('203.0.113.7');
    } finally {
      await app.close();
    }
  });
});
