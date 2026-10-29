import { APP_SHORT_NAME } from '@iot/shared';

/** Заголовок вкладки браузера: «<страница> — ИОТ» или только название приложения. */
export function setDocumentTitle(title?: string | null): void {
  document.title = title ? `${title} — ${APP_SHORT_NAME}` : APP_SHORT_NAME;
}
