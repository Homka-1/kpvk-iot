import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('Служебные эндпоинты (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health отвечает 200 и статусом ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('OpenAPI-описание доступно и содержит /api/health', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs/openapi.json').expect(200);
    expect(res.body.paths).toHaveProperty('/api/health');
  });

  it('п. 13: docs/api/openapi.json совпадает с описанием работающего API', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs/openapi.json').expect(200);
    const published: unknown = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../docs/api/openapi.json'), 'utf8'),
    );
    // Расхождение означает, что API изменился, а документацию не обновили: `pnpm docs:openapi`.
    expect(published).toEqual(res.body);
  });
});
