import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('возвращает статус ok', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
