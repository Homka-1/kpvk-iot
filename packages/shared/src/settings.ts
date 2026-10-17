// Системные настройки (раздел «Настройки»). Значения хранятся в таблице system_settings,
// при отсутствии записи действует значение по умолчанию. Новые настройки добавляются сюда.

export interface NumberSettingDefinition {
  key: string;
  /** Раздел страницы «Настройки». */
  group: string;
  label: string;
  description: string;
  /** Единица измерения для подписи поля. */
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
}

/**
 * Политика входа и формирование профилей. Значения по умолчанию приняты до ответа заказчика
 * (open-questions, вопросы 8 и 3).
 */
export const SYSTEM_SETTINGS = [
  {
    key: 'auth.maxFailedAttempts',
    group: 'Вход в систему',
    label: 'Неудачных попыток входа до блокировки',
    description: 'После указанного числа неверных паролей подряд вход временно блокируется.',
    unit: 'попыток',
    min: 3,
    max: 20,
    defaultValue: 5,
  },
  {
    key: 'auth.lockoutMinutes',
    group: 'Вход в систему',
    label: 'Длительность временной блокировки входа',
    description: 'Через это время пользователь снова может войти.',
    unit: 'мин',
    min: 1,
    max: 1440,
    defaultValue: 15,
  },
  {
    key: 'auth.passwordMinLength',
    group: 'Вход в систему',
    label: 'Минимальная длина пароля',
    description: 'Применяется при смене пароля. Пароль также должен содержать буквы и цифры.',
    unit: 'символов',
    min: 8,
    max: 64,
    defaultValue: 10,
  },
  {
    key: 'auth.sessionDays',
    group: 'Вход в систему',
    label: 'Срок действия сессии',
    description: 'Сколько дней пользователь остаётся в системе без повторного ввода пароля.',
    unit: 'дн.',
    min: 1,
    max: 30,
    defaultValue: 7,
  },
  {
    key: 'profiles.minScales',
    group: 'Мотивационные профили',
    label: 'Минимум шкал для предварительного профиля',
    description:
      'Сколько шкал с определённым уровнем нужно, чтобы система предложила профиль. Иначе — «Требуется дополнительная диагностика».',
    unit: 'шкал',
    min: 1,
    max: 10,
    defaultValue: 1,
  },
] as const satisfies readonly NumberSettingDefinition[];

export type SystemSettingKey = (typeof SYSTEM_SETTINGS)[number]['key'];
export type SystemSettings = Record<SystemSettingKey, number>;
