import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

/** Колонка файла импорта: ключ поля, заголовок для сообщений и допустимые написания заголовка. */
export interface ImportColumn<F extends string> {
  key: F;
  title: string;
  required: boolean;
  /** Заголовки в нижнем регистре, «ё» заменена на «е». */
  aliases: readonly string[];
}

/** Строка файла импорта до проверки: значения колонок как есть (после обрезки пробелов). */
export interface RawImportRow<F extends string> {
  line: number;
  values: Record<F, string>;
}

export interface ParsedImportFile<F extends string> {
  rows: RawImportRow<F>[];
  fileErrors: string[];
}

export interface ImportFileSpec<F extends string> {
  columns: readonly ImportColumn<F>[];
  maxRows: number;
  /** Сообщение для файла без строк данных. */
  emptyMessage: string;
}

const UNSUPPORTED = 'Поддерживаются файлы CSV и XLSX (первая строка — заголовки колонок)';

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function isZip(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
}

/** Текст CSV: UTF-8 (с BOM или без), иначе Windows-1251 — так сохраняет CSV русский Excel. */
function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1251').decode(buffer);
  }
}

function readCsv(buffer: Buffer): string[][] {
  if (buffer.includes(0)) throw new BadRequestException(UNSUPPORTED);
  const text = decodeText(buffer);
  // Разделитель — тот из «;», «,», табуляции, что чаще встречается в строке заголовков.
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].reduce((best, candidate) =>
    header.split(candidate).length > header.split(best).length ? candidate : best,
  );
  return Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false }).data;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Ячейка-дата Excel как текст: только время (день 1899-12-30) — «ЧЧ:ММ», дата без времени —
 * «дд.мм.гггг», иначе оба. ExcelJS отдаёт даты в UTC без смещения часового пояса.
 */
function formatExcelDate(value: Date): string {
  const time = `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  if (value.getUTCFullYear() < 1900) return time;
  const date = `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`;
  return time === '00:00' ? date : `${date} ${time}`;
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  const date =
    value instanceof Date
      ? value
      : value && typeof value === 'object' && 'result' in value && value.result instanceof Date
        ? value.result
        : null;
  return date ? formatExcelDate(date) : (cell.text ?? '');
}

async function readXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException(
      'Не удалось прочитать файл XLSX. Проверьте, что файл не повреждён',
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column++) {
      cells.push(cellText(row.getCell(column)));
    }
    rows[rowNumber - 1] = cells;
  });
  return Array.from(rows, (row) => row ?? []);
}

/**
 * Разбор табличного файла импорта (CSV или XLSX, первая строка — заголовки). Тип определяется
 * по содержимому, а не только по расширению: XLSX — ZIP-архив, CSV — текст без нулевых байтов.
 * Заголовки сравниваются без учёта регистра; пустые строки пропускаются.
 */
export async function parseTableFile<F extends string>(
  buffer: Buffer,
  fileName: string,
  spec: ImportFileSpec<F>,
): Promise<ParsedImportFile<F>> {
  const extension = fileName.toLowerCase().split('.').pop();
  let table: string[][];
  if (extension === 'xlsx' && isZip(buffer)) table = await readXlsx(buffer);
  else if (extension === 'csv' && !isZip(buffer)) table = readCsv(buffer);
  else throw new BadRequestException(UNSUPPORTED);

  const [header, ...body] = table;
  if (!header || header.every((cell) => !cell?.trim())) {
    return { rows: [], fileErrors: ['Файл пуст: нет строки заголовков'] };
  }

  const columns = new Map<F, number>();
  header.forEach((cell, index) => {
    const normalized = normalizeHeader(cell ?? '');
    const column = spec.columns.find(({ aliases }) => aliases.includes(normalized));
    if (column && !columns.has(column.key)) columns.set(column.key, index);
  });
  const missing = spec.columns
    .filter((column) => column.required && !columns.has(column.key))
    .map((column) => `«${column.title}»`);
  if (missing.length > 0) {
    return { rows: [], fileErrors: [`Нет обязательных колонок: ${missing.join(', ')}`] };
  }

  const rows: RawImportRow<F>[] = [];
  body.forEach((cells, index) => {
    if (!cells || cells.every((cell) => !cell?.trim())) return;
    const values = Object.fromEntries(
      spec.columns.map(({ key }) => {
        const column = columns.get(key);
        return [key, column === undefined ? '' : (cells[column] ?? '').trim()];
      }),
    ) as Record<F, string>;
    rows.push({ line: index + 2, values });
  });

  if (rows.length === 0) return { rows, fileErrors: [spec.emptyMessage] };
  if (rows.length > spec.maxRows) {
    return {
      rows: [],
      fileErrors: [
        `В файле ${rows.length} строк, допускается не более ${spec.maxRows}. Разделите файл на части`,
      ],
    };
  }
  return { rows, fileErrors: [] };
}
