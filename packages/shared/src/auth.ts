// Роли, разрешения и контракты авторизации (ТЗ, п. 2, п. 8.3). Каталог прав — единственный
// источник: API синхронизирует его с таблицами roles/permissions при запуске, интерфейс по нему
// скрывает недоступные разделы. Проверка прав всегда выполняется на сервере.
import { z } from 'zod';

type ValueOf<T> = T[keyof T];

export const RoleCode = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
  RESEARCHER: 'researcher',
} as const;
export type RoleCode = ValueOf<typeof RoleCode>;
export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: 'Администратор',
  teacher: 'Преподаватель',
  student: 'Студент',
  researcher: 'Исследователь',
};
export const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  admin:
    'Учётные записи, группы, дисциплины, роли и настройки. Не имеет доступа к диагностическим ответам по должности (п. 2.1 ТЗ).',
  teacher:
    'Диагностика, мотивационные профили, ИОТ, задания, мониторинг и обратная связь по своим группам и дисциплинам (п. 2.2 ТЗ).',
  student: 'Личный кабинет: только собственные данные (п. 2.3 ТЗ).',
  researcher:
    'Обезличенные результаты, групповая аналитика и экспорт. Персональные данные — только по отдельному разрешению (п. 2.4 ТЗ).',
};

export const Permission = {
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_READ: 'audit.read',
  GROUPS_MANAGE: 'groups.manage',
  DISCIPLINES_MANAGE: 'disciplines.manage',
  DISCIPLINES_READ: 'disciplines.read',
  STUDENTS_READ: 'students.read',
  STUDENTS_MANAGE: 'students.manage',
  OBSERVATIONS_MANAGE: 'observations.manage',
  DIAGNOSTICS_MANAGE: 'diagnostics.manage',
  DIAGNOSTIC_ANSWERS_READ: 'diagnostics.answers.read',
  PROFILES_MANAGE: 'profiles.manage',
  TRAJECTORIES_MANAGE: 'trajectories.manage',
  TRAJECTORIES_APPROVE: 'trajectories.approve',
  ASSIGNMENTS_MANAGE: 'assignments.manage',
  MONITORING_READ: 'monitoring.read',
  FEEDBACK_MANAGE: 'feedback.manage',
  LIBRARY_MANAGE: 'library.manage',
  ANALYTICS_READ: 'analytics.read',
  REPORTS_READ: 'reports.read',
  RESEARCH_READ: 'research.read',
  RESEARCH_EXPORT: 'research.export',
  RESEARCH_PERSONAL_DATA_READ: 'research.personal_data.read',
  CABINET_ACCESS: 'cabinet.access',
} as const;
export type Permission = ValueOf<typeof Permission>;

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'users.manage': 'Управление учётными записями: создание, блокировка, сброс пароля, роли',
  'roles.manage': 'Выдача и отзыв индивидуальных разрешений',
  'settings.manage': 'Изменение системных настроек',
  'audit.read': 'Просмотр журнала аудита',
  'groups.manage': 'Управление учебными группами',
  'disciplines.manage': 'Управление дисциплинами и закреплением преподавателей',
  'disciplines.read': 'Просмотр дисциплин',
  'students.read': 'Просмотр студентов своих групп',
  'students.manage': 'Добавление, импорт, перевод и архивирование студентов',
  'observations.manage': 'Педагогические наблюдения о студентах своих групп',
  'diagnostics.manage': 'Методики диагностики и их назначение',
  'diagnostics.answers.read': 'Доступ к содержанию диагностических ответов',
  'profiles.manage': 'Формирование и утверждение мотивационных профилей',
  'trajectories.manage': 'Создание и корректировка ИОТ',
  'trajectories.approve': 'Утверждение ИОТ',
  'assignments.manage': 'Назначение и проверка заданий',
  'monitoring.read': 'Мониторинг выполнения ИОТ',
  'feedback.manage': 'Обратная связь и консультации',
  'library.manage': 'Библиотека материалов и заданий',
  'analytics.read': 'Просмотр аналитики',
  'reports.read': 'Формирование отчётов',
  'research.read': 'Обезличенные исследовательские данные',
  'research.export': 'Экспорт исследовательских данных',
  'research.personal_data.read': 'Просмотр персональных данных участников исследования',
  'cabinet.access': 'Личный кабинет студента',
};

/**
 * Разрешения к конфиденциальным данным. Выдаются только индивидуально, с указанием основания,
 * и никогда самому себе (п. 2.1, 2.4 ТЗ). Роль администратора их не содержит.
 */
export const SENSITIVE_PERMISSIONS: readonly Permission[] = [
  Permission.DIAGNOSTIC_ANSWERS_READ,
  Permission.RESEARCH_PERSONAL_DATA_READ,
];

/** Разрешения системных ролей. */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  admin: [
    Permission.USERS_MANAGE,
    Permission.ROLES_MANAGE,
    Permission.SETTINGS_MANAGE,
    Permission.AUDIT_READ,
    Permission.GROUPS_MANAGE,
    Permission.DISCIPLINES_MANAGE,
    Permission.DISCIPLINES_READ,
  ],
  teacher: [
    Permission.DISCIPLINES_READ,
    Permission.STUDENTS_READ,
    Permission.STUDENTS_MANAGE,
    Permission.OBSERVATIONS_MANAGE,
    Permission.DIAGNOSTICS_MANAGE,
    Permission.DIAGNOSTIC_ANSWERS_READ,
    Permission.PROFILES_MANAGE,
    Permission.TRAJECTORIES_MANAGE,
    Permission.TRAJECTORIES_APPROVE,
    Permission.ASSIGNMENTS_MANAGE,
    Permission.MONITORING_READ,
    Permission.FEEDBACK_MANAGE,
    Permission.LIBRARY_MANAGE,
    Permission.ANALYTICS_READ,
    Permission.REPORTS_READ,
  ],
  student: [Permission.CABINET_ACCESS],
  researcher: [
    Permission.ANALYTICS_READ,
    Permission.REPORTS_READ,
    Permission.RESEARCH_READ,
    Permission.RESEARCH_EXPORT,
  ],
};

/** Роли, которые назначаются в разделе «Администрирование». Студенты создаются в разделе «Студенты». */
export const STAFF_ROLES: readonly RoleCode[] = [
  RoleCode.ADMIN,
  RoleCode.TEACHER,
  RoleCode.RESEARCHER,
];

/** Имена cookie и заголовка сессии. Refresh-токен — httpOnly, CSRF-токен читается скриптом. */
export const REFRESH_COOKIE = 'iot_refresh';
export const CSRF_COOKIE = 'iot_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Текущий пользователь (`GET /api/auth/me`). */
export interface CurrentUser {
  id: string;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  roles: RoleCode[];
  permissions: Permission[];
  mustChangePassword: boolean;
}

/** Ответ входа и обновления сессии. */
export interface SessionResponse {
  accessToken: string;
  /** Срок жизни access-токена, секунды. */
  expiresIn: number;
  user: CurrentUser;
}

/** Ошибка API: единый формат для всех эндпоинтов (NFR-005). */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  /** Ошибки полей формы: имя поля → сообщение. */
  fields?: Record<string, string>;
}

export function formatFullName(user: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');
}

// ── Пароли ──

export const PASSWORD_MAX_LENGTH = 128;

/**
 * Проверка пароля по политике. Возвращает текст ошибки или null.
 * Минимальная длина задаётся в системных настройках (`auth.passwordMinLength`).
 */
export function checkPassword(password: string, minLength: number, login?: string): string | null {
  if (password.length < minLength) return `Пароль должен содержать не менее ${minLength} символов`;
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Пароль должен содержать не более ${PASSWORD_MAX_LENGTH} символов`;
  if (!/\p{L}/u.test(password) || !/\d/.test(password))
    return 'Пароль должен содержать буквы и цифры';
  if (login && password.toLowerCase().includes(login.toLowerCase()))
    return 'Пароль не должен содержать логин';
  return null;
}

// ── Схемы форм (zod) ──

export const LOGIN_PATTERN = /^[a-zA-Z0-9._-]{3,64}$/;

export const loginFormSchema = z.object({
  login: z.string().trim().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль'),
});

export function changePasswordFormSchema(minLength: number) {
  return z
    .object({
      currentPassword: z.string().min(1, 'Введите текущий пароль'),
      newPassword: z.string(),
      confirmPassword: z.string(),
    })
    .superRefine((value, ctx) => {
      const error = checkPassword(value.newPassword, minLength);
      if (error) ctx.addIssue({ code: 'custom', path: ['newPassword'], message: error });
      if (value.newPassword !== value.confirmPassword)
        ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Пароли не совпадают' });
    });
}

export const userFormSchema = z.object({
  login: z
    .string()
    .trim()
    .regex(
      LOGIN_PATTERN,
      'Логин: 3–64 символа, латинские буквы, цифры, точка, дефис, подчёркивание',
    ),
  lastName: z.string().trim().min(1, 'Укажите фамилию').max(100),
  firstName: z.string().trim().min(1, 'Укажите имя').max(100),
  middleName: z.string().trim().max(100).optional(),
  email: z
    .string()
    .trim()
    .email('Некорректный адрес электронной почты')
    .optional()
    .or(z.literal('')),
  roles: z
    .array(z.enum([RoleCode.ADMIN, RoleCode.TEACHER, RoleCode.RESEARCHER]))
    .min(1, 'Выберите хотя бы одну роль'),
});
export type UserFormValues = z.infer<typeof userFormSchema>;
