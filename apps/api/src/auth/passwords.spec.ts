import { checkPassword } from '@iot/shared';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './passwords.js';

describe('пароли', () => {
  it('п. 8.3: хранится хеш argon2id, проверка работает', async () => {
    const hash = await hashPassword('Пароль-2026');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Пароль-2026')).toBe(true);
    expect(await verifyPassword(hash, 'другой')).toBe(false);
    expect(await verifyPassword('не хеш', 'Пароль-2026')).toBe(false);
  });

  it('временный пароль соответствует политике паролей', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(12);
      expect(checkPassword(password, 10)).toBeNull();
    }
  });
});
