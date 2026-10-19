import { DiagnosticExportFormat, type ExportCell, type ExportTable } from '@iot/shared';
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

/** CSV: UTF-8 с BOM (Excel открывает кириллицу без выбора кодировки), разделитель «;», CRLF. */
function toCsv(table: ExportTable): Buffer {
  const csv = Papa.unparse(
    { fields: table.header, data: table.rows.map((row) => row.map(spreadsheetSafe)) },
    { delimiter: ';', newline: '\r\n' },
  );
  return Buffer.from(`${UTF8_BOM}${csv}`, 'utf8');
}

/** XLSX: лист с закреплённой строкой заголовков; пустое значение — пустая ячейка, не ноль. */
async function toXlsx(table: ExportTable, sheetName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(table.header).font = { bold: true };
  for (const row of table.rows) {
    sheet.addRow(row.map((cell) => spreadsheetSafe(cell) ?? undefined));
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Файл выгрузки в выбранном формате; имя — `<base>-<дата>.<формат>`. */
export async function exportFile(
  table: ExportTable,
  format: DiagnosticExportFormat,
  baseName: string,
  sheetName: string,
): Promise<ExportFile> {
  const date = new Date().toISOString().slice(0, 10);
  return format === DiagnosticExportFormat.XLSX
    ? {
        content: await toXlsx(table, sheetName),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: `${baseName}-${date}.xlsx`,
      }
    : {
        content: toCsv(table),
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
