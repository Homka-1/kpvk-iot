import { FILE_UPLOAD_EXTENSIONS, type FileUploadExtension } from '@iot/shared';

/**
 * Проверка загружаемого файла по содержимому (п. 8.3): расширение должно быть в белом списке,
 * а первые байты — соответствовать формату. MIME-тип берётся из таблицы, а не из запроса:
 * заголовок Content-Type присылает клиент, ему доверять нельзя.
 */
interface FileFormat {
  mimeType: string;
  matches: (content: Buffer) => boolean;
}

const startsWith = (content: Buffer, signature: number[] | string): boolean => {
  const bytes =
    typeof signature === 'string' ? Buffer.from(signature, 'latin1') : Buffer.from(signature);
  return content.length >= bytes.length && content.subarray(0, bytes.length).equals(bytes);
};

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Документ Office Open XML: ZIP-архив с `[Content_Types].xml` и каталогом части (`word/` и т. п.). */
const officeOpenXml = (part: string) => (content: Buffer) =>
  startsWith(content, ZIP) &&
  content.includes('[Content_Types].xml', 0, 'latin1') &&
  content.includes(`${part}/`, 0, 'latin1');

/** Документ OpenDocument: первый файл архива — `mimetype` с типом документа без сжатия. */
const openDocument = (mimeType: string) => (content: Buffer) =>
  startsWith(content, ZIP) && content.subarray(0, 200).includes(mimeType, 0, 'latin1');

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** Текст: корректный UTF-8 без нулевых байтов (двоичные файлы их почти всегда содержат). */
function isPlainText(content: Buffer): boolean {
  if (content.includes(0)) return false;
  try {
    utf8.decode(content);
    return true;
  } catch {
    return false;
  }
}

const FORMATS: Record<FileUploadExtension, FileFormat> = {
  pdf: { mimeType: 'application/pdf', matches: (content) => startsWith(content, '%PDF-') },
  doc: { mimeType: 'application/msword', matches: (content) => startsWith(content, OLE) },
  xls: { mimeType: 'application/vnd.ms-excel', matches: (content) => startsWith(content, OLE) },
  ppt: {
    mimeType: 'application/vnd.ms-powerpoint',
    matches: (content) => startsWith(content, OLE),
  },
  docx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    matches: officeOpenXml('word'),
  },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    matches: officeOpenXml('xl'),
  },
  pptx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    matches: officeOpenXml('ppt'),
  },
  odt: {
    mimeType: 'application/vnd.oasis.opendocument.text',
    matches: openDocument('application/vnd.oasis.opendocument.text'),
  },
  ods: {
    mimeType: 'application/vnd.oasis.opendocument.spreadsheet',
    matches: openDocument('application/vnd.oasis.opendocument.spreadsheet'),
  },
  odp: {
    mimeType: 'application/vnd.oasis.opendocument.presentation',
    matches: openDocument('application/vnd.oasis.opendocument.presentation'),
  },
  txt: { mimeType: 'text/plain; charset=utf-8', matches: isPlainText },
  png: {
    mimeType: 'image/png',
    matches: (content) => startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  jpg: { mimeType: 'image/jpeg', matches: (content) => startsWith(content, [0xff, 0xd8, 0xff]) },
  jpeg: { mimeType: 'image/jpeg', matches: (content) => startsWith(content, [0xff, 0xd8, 0xff]) },
};

export type FileCheckResult =
  | { ok: true; extension: FileUploadExtension; mimeType: string }
  | { ok: false; reason: 'extension' | 'content' | 'empty' };

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function checkFile(originalName: string, content: Buffer): FileCheckResult {
  const extension = fileExtension(originalName);
  if (!(FILE_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, reason: 'extension' };
  }
  if (content.length === 0) return { ok: false, reason: 'empty' };
  const format = FORMATS[extension as FileUploadExtension];
  return format.matches(content)
    ? { ok: true, extension: extension as FileUploadExtension, mimeType: format.mimeType }
    : { ok: false, reason: 'content' };
}
