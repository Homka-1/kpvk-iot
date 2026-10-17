import { BadRequestException } from '@nestjs/common';
import {
  STUDENT_IMPORT_COLUMNS,
  STUDENT_IMPORT_MAX_ROWS,
  type StudentImportField,
} from '@iot/shared';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

/** Строка файла импорта до проверки: значения колонок как есть (после обрезки пробелов). */
export interface RawImportRow {
  line: number;
  values: Record<StudentImportField, string>;
}

export interface ParsedImportFile {
  rows: RawImportRow[];
  fileErrors: string[];
}

/** Допустимые заголовки колонок (без учёта регистра, «ё» = «е»). */
const HEADER_ALIASES: Record<StudentImportField, string[]> = {
  lastName: ['фамилия', 'lastname', 'last name'],
  firstName: ['имя', 'firstname', 'first name'],
  middleName: ['отчество', 'middlename', 'middle name'],
  groupName: ['группа', 'group'],
  participantCode: ['код участника', 'код', 'participantcode', 'participant code', 'code'],
  login: ['логин', 'login'],
};

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
      cells.push(row.getCell(column).text ?? '');
    }
    rows[rowNumber - 1] = cells;
  });
  return Array.from(rows, (row) => row ?? []);
}

/**
 * Разбор файла импорта студентов (FR-006). Тип определяется по содержимому, а не только
 * по расширению: XLSX — ZIP-архив, CSV — текст без нулевых байтов.
 */
export async function parseImportFile(buffer: Buffer, fileName: string): Promise<ParsedImportFile> {
  const extension = fileName.toLowerCase().split('.').pop();
  let table: string[][];
  if (extension === 'xlsx' && isZip(buffer)) table = await readXlsx(buffer);
  else if (extension === 'csv' && !isZip(buffer)) table = readCsv(buffer);
  else throw new BadRequestException(UNSUPPORTED);

  const [header, ...body] = table;
  if (!header || header.every((cell) => !cell?.trim())) {
    return { rows: [], fileErrors: ['Файл пуст: нет строки заголовков'] };
  }

  const columns = new Map<StudentImportField, number>();
  header.forEach((cell, index) => {
    const normalized = normalizeHeader(cell ?? '');
    const field = (Object.keys(HEADER_ALIASES) as StudentImportField[]).find((key) =>
      HEADER_ALIASES[key].includes(normalized),
    );
    if (field && !columns.has(field)) columns.set(field, index);
  });
  const missing = STUDENT_IMPORT_COLUMNS.filter(
    (column) => column.required && !columns.has(column.key),
  ).map((column) => `«${column.title}»`);
  if (missing.length > 0) {
    return { rows: [], fileErrors: [`Нет обязательных колонок: ${missing.join(', ')}`] };
  }

  const rows: RawImportRow[] = [];
  body.forEach((cells, index) => {
    if (!cells || cells.every((cell) => !cell?.trim())) return;
    const values = Object.fromEntries(
      STUDENT_IMPORT_COLUMNS.map(({ key }) => {
        const column = columns.get(key);
        return [key, column === undefined ? '' : (cells[column] ?? '').trim()];
      }),
    ) as Record<StudentImportField, string>;
    rows.push({ line: index + 2, values });
  });

  if (rows.length === 0) return { rows, fileErrors: ['В файле нет строк со студентами'] };
  if (rows.length > STUDENT_IMPORT_MAX_ROWS) {
    return {
      rows: [],
      fileErrors: [
        `В файле ${rows.length} строк, допускается не более ${STUDENT_IMPORT_MAX_ROWS}. Разделите файл на части`,
      ],
    };
  }
  return { rows, fileErrors: [] };
}
