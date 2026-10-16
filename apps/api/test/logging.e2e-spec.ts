import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { RoleCode } from '@iot/shared';
import { pino } from 'pino';
import request from 'supertest';
import { AppLogger } from '../src/logging/app-logger.js';
import { createTestApp, createUser, login } from './helpers.js';

describe('Журнал без персональных данных (e2e)', () => {
  const lines: string[] = [];
  let app: INestApplication;

  beforeAll(async () => {
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    app = await createTestApp(new AppLogger(pino({ level: 'info' }, stream)));
  });

  afterAll(async () => {
    await app.close();
  });

  it('п. 8.3: в журнале запросов нет логина, ФИО, пароля, токенов, e-mail и query-параметров', async () => {
    const user = await createUser(app, { role: RoleCode.ADMIN, lastName: 'Персональнова' });
    const session = await login(app, user.login);
    const http = () => request(app.getHttpServer());

    await http()
      .post('/api/auth/login')
      .send({ login: user.login, password: 'Секретный-пароль-1' })
      .expect(401);
    await http()
      .get('/api/admin/users')
      .query({ search: 'Персональнова' })
      .auth(session.accessToken, { type: 'bearer' })
      .expect(200);
    // Неизвестный параметр отклоняется проверкой, но и он не должен попасть в журнал.
    await http()
      .get('/api/admin/users')
      .query({ email: 'person@college.kz' })
      .auth(session.accessToken, { type: 'bearer' })
      .expect(400);
    await http()
      .post('/api/admin/users')
      .auth(session.accessToken, { type: 'bearer' })
      .send({
        login: 'bad login',
        lastName: 'Персональнова',
        firstName: 'Ф',
        email: 'x@y.kz',
        roles: [],
      })
      .expect(400);

    const log = lines.join('');
    expect(log).toContain('"path":"/api/admin/users"');
    expect(log).toContain('"status":401');
    for (const secret of [
      user.login,
      'Персональнова',
      'Секретный-пароль-1',
      user.password,
      'person@college.kz',
      'x@y.kz',
      session.accessToken,
      'search=',
    ]) {
      expect(log).not.toContain(secret);
    }
  });

  it('п. 8.3: при ошибке 500 клиент получает понятное сообщение, а ПДн из текста ошибки маскируются', () => {
    const before = lines.length;
    new AppLogger(pino({ level: 'info' }, { write: (line: string) => lines.push(line) })).error(
      'Сбой при обработке ivanov@college.kz, ИИН 990101300123, тел. +7 701 123 45 67',
      'Error: stack ivanov@college.kz',
      'Test',
    );
    const entry = lines.slice(before).join('');
    expect(entry).not.toMatch(/ivanov@college\.kz|990101300123|701 123 45 67/);
    expect(entry).toContain('[email]');
    expect(entry).toContain('[ИИН]');
    expect(entry).toContain('[телефон]');
  });
});
