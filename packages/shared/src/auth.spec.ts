import { describe, expect, it } from 'vitest';
import {
  changePasswordFormSchema,
  checkPassword,
  Permission,
  ROLE_PERMISSIONS,
  SENSITIVE_PERMISSIONS,
} from './auth.js';

describe('каталог прав', () => {
  it('п. 2.1: администратор не получает доступ к диагностическим ответам по роли', () => {
    expect(ROLE_PERMISSIONS.admin).not.toContain(Permission.DIAGNOSTIC_ANSWERS_READ);
  });

  it('п. 2.4: исследователь не получает персональные данные по роли', () => {
    expect(ROLE_PERMISSIONS.researcher).not.toContain(Permission.RESEARCH_PERSONAL_DATA_READ);
    expect(SENSITIVE_PERMISSIONS).toContain(Permission.RESEARCH_PERSONAL_DATA_READ);
  });

  it('AT-12: студент имеет только доступ к личному кабинету', () => {
    expect(ROLE_PERMISSIONS.student).toEqual([Permission.CABINET_ACCESS]);
  });
});

describe('политика паролей', () => {
  it('отклоняет короткий пароль, пароль без цифр и пароль с логином', () => {
    expect(checkPassword('abc123', 10)).toMatch(/не менее 10/);
    expect(checkPassword('абвгдеёжзий', 10)).toMatch(/буквы и цифры/);
    expect(checkPassword('ivanov2024x', 10, 'Ivanov')).toMatch(/логин/);
    expect(checkPassword('Надёжный-пароль-7', 10, 'ivanov')).toBeNull();
  });

  it('форма смены пароля проверяет совпадение подтверждения', () => {
    const result = changePasswordFormSchema(10).safeParse({
      currentPassword: 'old',
      newPassword: 'NewPassword1',
      confirmPassword: 'NewPassword2',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });
});
