import { createRequire } from 'node:module';
import { formatDateRu, ReportFormat, reportText, type ReportDocument } from '@iot/shared';
import ExcelJS from 'exceljs';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces.js';

const require = createRequire(import.meta.url);

interface PdfKitDocument {
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  on(event: 'end', listener: () => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  end(): void;
}
type PdfPrinterConstructor = new (fonts: Record<string, Record<string, Buffer>>) => {
  createPdfKitDocument(definition: TDocumentDefinitions): PdfKitDocument;
};

/** Roboto из поставки pdfmake содержит кириллицу; внешние шрифты и сеть не нужны. */
function pdfFonts(): Record<string, Record<string, Buffer>> {
  const vfs = require('pdfmake/build/vfs_fonts.js') as Record<string, string>;
  const font = (name: string) => Buffer.from(vfs[name]!, 'base64');
  return {
    Roboto: {
      normal: font('Roboto-Regular.ttf'),
      bold: font('Roboto-Medium.ttf'),
      italics: font('Roboto-Italic.ttf'),
      bolditalics: font('Roboto-MediumItalic.ttf'),
    },
  };
}

const NAVY = '#1f3a5f';
const INFO_BG = '#e8f1fb';

const generatedAtText = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${formatDateRu(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function pdfDefinition(report: ReportDocument): TDocumentDefinitions {
  const requisites: Content = {
    table: {
      widths: ['auto', '*'],
      body: [
        ['Дата формирования', generatedAtText(report.generatedAt)],
        ['Период', report.period],
        ['Сформировал', report.author],
        ...(report.scope.length > 0 ? [['Условия отбора', report.scope.join('; ')]] : []),
      ].map((row) => [{ text: row[0]!, bold: true }, { text: row[1]! }]),
    },
    layout: 'noBorders',
    fillColor: INFO_BG,
    margin: [0, 0, 0, 12],
  };

  const sections: Content[] = report.sections.flatMap((section): Content[] => {
    const content: Content[] = [{ text: section.title, style: 'heading' }];
    if (section.facts && section.facts.length > 0) {
      content.push({
        table: {
          widths: ['*', 'auto'],
          body: section.facts.map(([label, value]) => [
            label,
            { text: reportText(value), bold: true },
          ]),
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 6],
      });
    }
    if (section.table) {
      const columns = section.table.header.length;
      content.push({
        table: {
          headerRows: 1,
          widths: Array.from({ length: columns }, () => '*'),
          body: [
            section.table.header.map((text): TableCell => ({
              text,
              bold: true,
              fillColor: INFO_BG,
              fontSize: 8,
            })),
            ...section.table.rows.map((row) =>
              row.map((cell): TableCell => ({ text: reportText(cell), fontSize: 8 })),
            ),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 6],
      });
    }
    if (section.note) content.push({ text: section.note, italics: true, margin: [0, 0, 0, 6] });
    return content;
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [32, 36, 32, 40],
    info: { title: report.title, author: report.author },
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      title: { fontSize: 16, bold: true, color: NAVY, margin: [0, 0, 0, 8] },
      heading: { fontSize: 12, bold: true, color: NAVY, margin: [0, 10, 0, 4] },
    },
    footer: (page, pages) => ({
      text: `${report.title} · страница ${page} из ${pages}`,
      alignment: 'center',
      fontSize: 8,
      margin: [0, 10, 0, 0],
    }),
    content: [{ text: report.title, style: 'title' }, requisites, ...sections],
  };
}

function renderPdf(report: ReportDocument): Promise<Buffer> {
  const Printer = require('pdfmake') as PdfPrinterConstructor;
  const document = new Printer(pdfFonts()).createPdfKitDocument(pdfDefinition(report));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.end();
  });
}

/** Имя листа XLSX: до 31 символа, без символов `: \ / ? * [ ]`; повторы получают номер. */
function sheetName(title: string, used: Set<string>): string {
  const base =
    title
      .replace(/[:\\/?*[\]]/g, ' ')
      .slice(0, 28)
      .trim() || 'Лист';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/** Текст ячейки не должен исполняться как формула при открытии файла. */
const safe = (value: string | number | null): string | number | undefined => {
  if (value === null || value === '') return undefined;
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
};

async function renderXlsx(report: ReportDocument): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = report.author;
  workbook.created = new Date(report.generatedAt);
  const used = new Set<string>();

  const summary = workbook.addWorksheet(sheetName('Сводка', used));
  summary.columns = [{ width: 28 }, { width: 70 }];
  summary.addRow([report.title]).font = { bold: true, size: 14 };
  summary.addRow(['Дата формирования', generatedAtText(report.generatedAt)]);
  summary.addRow(['Период', report.period]);
  summary.addRow(['Сформировал', report.author]);
  if (report.scope.length > 0) summary.addRow(['Условия отбора', report.scope.join('; ')]);
  for (const section of report.sections) {
    if (section.facts && section.facts.length > 0) {
      summary.addRow([]);
      summary.addRow([section.title]).font = { bold: true };
      for (const [label, value] of section.facts) {
        summary.addRow([label, reportText(value)]);
      }
    }
  }

  for (const section of report.sections) {
    if (!section.table) continue;
    const sheet = workbook.addWorksheet(sheetName(section.title, used));
    sheet.addRow(section.table.header).font = { bold: true };
    for (const row of section.table.rows) {
      // Пропуск в таблице — «Нет данных», не пустая ячейка и не ноль.
      sheet.addRow(row.map((cell) => safe(cell === null ? reportText(cell) : cell)));
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column) => (column.width = 18));
    if (section.note) {
      sheet.addRow([]);
      sheet.addRow([section.note]);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const REPORT_CONTENT_TYPES: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function renderReport(report: ReportDocument, format: ReportFormat): Promise<Buffer> {
  return format === ReportFormat.PDF ? renderPdf(report) : renderXlsx(report);
}
