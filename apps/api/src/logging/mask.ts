/**
 * Маскирование персональных данных в журналах (п. 8.3 ТЗ, законодательство РК).
 * Поля с ПДн и секретами скрываются по имени ключа, а в строках заменяются
 * адреса электронной почты, номера телефонов и ИИН.
 */
const MASK = '[скрыто]';

const SENSITIVE_KEYS = new Set(
  [
    'password',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'temporaryPassword',
    'passwordHash',
    'accessToken',
    'refreshToken',
    'token',
    'authorization',
    'cookie',
    'set-cookie',
    'x-csrf-token',
    'login',
    'lastName',
    'firstName',
    'middleName',
    'fullName',
    'email',
    'phone',
    'iin',
  ].map((key) => key.toLowerCase()),
);

const EMAIL = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/gu;
const PHONE = /(?<![\d])(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?![\d])/g;
const IIN = /(?<!\d)\d{12}(?!\d)/g;

export function maskString(value: string): string {
  return value.replace(EMAIL, '[email]').replace(PHONE, '[телефон]').replace(IIN, '[ИИН]');
}

export function maskPersonalData(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return maskString(value);
  if (value === null || typeof value !== 'object' || depth > 8) return value;
  if (value instanceof Error) {
    return { name: value.name, message: maskString(value.message), stack: maskStack(value.stack) };
  }
  if (Array.isArray(value)) return value.map((item) => maskPersonalData(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? MASK : maskPersonalData(item, depth + 1);
  }
  return result;
}

function maskStack(stack: string | undefined): string | undefined {
  return stack === undefined ? undefined : maskString(stack);
}
