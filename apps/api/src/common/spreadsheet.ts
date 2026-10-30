import {
  DiagnosticExportFormat,
  type ExportCell,
  type ExportSheet,
  type ExportTable,
} from '@iot/shared';
import { StreamableFile } from '@nestjs/common';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

const UTF8_BOM = String.fromCharCode(0xfeff);

export interface ExportFile {
  content: Buffer;
  contentType: string;
  fileName: string;
}

/**
 * Защита от формул в электронных таблицах: текст, начинающийся с «=», «+», «-», «@»,
 * табуляции или перевода строки, выгружается с апострофом и не исполняется при открытии.
 */
function spreadsheetSafe(cell: ExportCell): ExportCell {
  return typeof cell === 'string' && /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

const CSV_NEWLINE = '\r\n';

const csvText = (table: ExportTable) =>
  Papa.unparse(
    { fields: table.header, data: table.rows.map((row) => row.map(spreadsheetSafe)) },
    { delimiter: ';', newline: CSV_NEWLINE },
  );

/**
 * CSV: UTF-8 с BOM (Excel открывает кириллицу без выбора кодировки), разделитель «;», CRLF.
 * Несколько таблиц — разделы подряд: строка с заголовком таблицы, таблица, пустая строка.
 */
function toCsv(sheets: readonly ExportSheet[]): Buffer {
  const csv =
    sheets.length === 1
      ? csvText(sheets[0]!.table)
      : sheets
          .map(
            (sheet) =>
              `${Papa.unparse([[spreadsheetSafe(sheet.title)]])}${CSV_NEWLINE}${csvText(sheet.table)}`,
          )
          .join(`${CSV_NEWLINE}${CSV_NEWLINE}`);
  return Buffer.from(`${UTF8_BOM}${csv}`, 'utf8');
}

/** XLSX: лист на таблицу с закреплённой строкой заголовков; пустое значение — пустая ячейка. */
async function toXlsx(sheets: readonly ExportSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const { name, table } of sheets) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(table.header).font = { bold: true };
    for (const row of table.rows) {
      sheet.addRow(row.map((cell) => spreadsheetSafe(cell) ?? undefined));
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Файл выгрузки в выбранном формате; имя — `<base>-<дата>.<формат>`. Одна таблица — лист
 * `sheetName`; несколько таблиц (`ExportSheet[]`) — по листу на каждую.
 */
export async function exportFile(
  content: ExportTable | readonly ExportSheet[],
  format: DiagnosticExportFormat,
  baseName: string,
  sheetName: string,
): Promise<ExportFile> {
  const date = new Date().toISOString().slice(0, 10);
  const sheets = Array.isArray(content)
    ? (content as readonly ExportSheet[])
    : [{ name: sheetName, title: sheetName, table: content as ExportTable }];
  return format === DiagnosticExportFormat.XLSX
    ? {
        content: await toXlsx(sheets),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: `${baseName}-${date}.xlsx`,
      }
    : {
        content: toCsv(sheets),
        contentType: 'text/csv; charset=utf-8',
        fileName: `${baseName}-${date}.csv`,
      };
}

/** Ответ контроллера: файл во вложении с именем и типом. */
export function downloadable(file: ExportFile): StreamableFile {
  return new StreamableFile(file.content, {
    type: file.contentType,
    disposition: `attachment; filename="${file.fileName}"`,
    length: file.content.length,
  });
}
