/** Полное название системы, используется в интерфейсе и документации API. */
export const APP_NAME = 'ИОТ — цифровое сопровождение индивидуальных образовательных траекторий';

/** Краткое название системы для шапки интерфейса. */
export const APP_SHORT_NAME = 'ИОТ';

/** Глобальный префикс REST API. */
export const API_PREFIX = 'api';

/** Ответ эндпоинта проверки работоспособности `GET /api/health`. */
export interface HealthResponse {
  status: 'ok';
}
