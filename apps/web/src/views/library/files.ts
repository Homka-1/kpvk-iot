import {
  FILE_UPLOAD_EXTENSIONS,
  FILE_UPLOAD_HINT,
  FILE_UPLOAD_MAX_BYTES,
  type FileDto,
  formatFileSize,
} from '@iot/shared';
import { api, apiDownload } from '@/api/http';

/** Атрибут accept для выбора файла: только расширения из белого списка. */
export const FILE_ACCEPT = FILE_UPLOAD_EXTENSIONS.map((extension) => `.${extension}`).join(',');

/**
 * Предварительная проверка до отправки: понятное сообщение без лишней загрузки.
 * Окончательно тип и содержимое проверяет сервер.
 */
export function precheckFile(file: File): string | null {
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!(FILE_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    return `Этот тип файла загружать нельзя. Допустимо: ${FILE_UPLOAD_HINT}`;
  }
  if (file.size > FILE_UPLOAD_MAX_BYTES) {
    return `Файл больше ${formatFileSize(FILE_UPLOAD_MAX_BYTES)}. Уменьшите размер файла`;
  }
  if (file.size === 0) return 'Файл пустой';
  return null;
}

export function uploadFile(file: File): Promise<FileDto> {
  const body = new FormData();
  body.append('file', file);
  return api<FileDto>('/files', { method: 'POST', body });
}

export function downloadFile(file: FileDto): Promise<void> {
  return apiDownload(`/files/${file.id}`);
}

export function fileLabel(file: FileDto): string {
  return `${file.originalName} (${formatFileSize(file.sizeBytes)})`;
}
