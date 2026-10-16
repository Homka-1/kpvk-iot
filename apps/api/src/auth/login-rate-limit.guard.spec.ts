import type { ExecutionContext } from '@nestjs/common';
import { LoginRateLimitGuard } from './login-rate-limit.guard.js';

function contextFor(ip: string, headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ setHeader: (name: string, value: string) => (headers[name] = value) }),
    }),
  } as unknown as ExecutionContext;
}

describe('LoginRateLimitGuard', () => {
  const original = process.env.LOGIN_RATE_LIMIT;
  afterEach(() => {
    process.env.LOGIN_RATE_LIMIT = original;
  });

  it('п. 8.3: ограничивает число попыток входа с одного IP в минуту', () => {
    process.env.LOGIN_RATE_LIMIT = '3';
    const guard = new LoginRateLimitGuard();
    for (let i = 0; i < 3; i++) expect(guard.canActivate(contextFor('10.0.0.1'))).toBe(true);
    const headers: Record<string, string> = {};
    expect(() => guard.canActivate(contextFor('10.0.0.1', headers))).toThrow(
      'Слишком много попыток входа',
    );
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
    // Другой адрес не затронут.
    expect(guard.canActivate(contextFor('10.0.0.2'))).toBe(true);
  });
});
