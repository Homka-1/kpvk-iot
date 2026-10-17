import { type ApiErrorBody, CSRF_COOKIE, CSRF_HEADER } from '@iot/shared';

/** Ошибка запроса к API с понятным сообщением (NFR-005) и ошибками полей формы. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_ERROR = 'Нет связи с сервером. Проверьте подключение к сети и повторите попытку';

export interface HttpHooks {
  /** Текущий access-токен. */
  getAccessToken: () => string | null;
  /** Обновление сессии при 401; возвращает true, если токен обновлён. */
  refresh: () => Promise<boolean>;
}

let hooks: HttpHooks = { getAccessToken: () => null, refresh: async () => false };

export function configureHttp(next: HttpHooks): void {
  hooks = next;
}

export function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  /** Запрос аутентифицируется refresh-cookie: передать CSRF-токен, не пытаться обновить сессию. */
  cookieAuth?: boolean;
  /** Не обновлять сессию при 401 (например, для входа: 401 означает неверный пароль). */
  noRefresh?: boolean;
  /** Дополнительные заголовки, например `Idempotency-Key`. */
  headers?: Record<string, string>;
}

/**
 * Запрос к REST API. Access-токен передаётся в заголовке; при 401 сессия обновляется один раз
 * и запрос повторяется. Ошибки приводятся к ApiError с сообщением на русском.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (
    response.status === 401 &&
    !options.cookieAuth &&
    !options.noRefresh &&
    (await hooks.refresh())
  ) {
    return parse<T>(await send(path, options));
  }
  return parse<T>(response);
}

/**
 * Скачивание файла из API (выгрузки): ответ сохраняется под именем из Content-Disposition.
 * Ошибки — как у `api`: ApiError с сообщением на русском.
 */
export async function apiDownload(path: string, options: RequestOptions = {}): Promise<void> {
  let response = await send(path, options);
  if (response.status === 401 && !options.noRefresh && (await hooks.refresh())) {
    response = await send(path, options);
  }
  if (!response.ok) return parse<void>(response);
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1];
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name ?? 'export';
  link.click();
  URL.revokeObjectURL(url);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const token = hooks.getAccessToken();
  if (token && !options.cookieAuth) headers.Authorization = `Bearer ${token}`;
  if (options.cookieAuth) headers[CSRF_HEADER] = readCookie(CSRF_COOKIE) ?? '';

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const url = `/api${path}${search.size ? `?${search}` : ''}`;
  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => undefined);
  if (response.ok) return data as T;
  const body = data as Partial<ApiErrorBody> | undefined;
  throw new ApiError(
    response.status,
    body?.message ?? 'Не удалось выполнить запрос. Повторите попытку позже',
    body?.fields,
  );
}

/** Ключ формы для защиты от повторной отправки (NFR-006): один ключ на одно заполнение формы. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
