import { type ReportDocument, ReportFormat } from '@iot/shared';
import ExcelJS from 'exceljs';
import { renderReport } from './report-renderer.js';

const report: ReportDocument = {
  kind: 'group',
  title: 'Отчёт по группе',
  generatedAt: '2026-10-20T09:30:00.000Z',
  period: 'Учебный год (01.09.2026 – 20.10.2026)',
  author: 'Иванова Мария Петровна',
  scope: ['Группа: ПО-21'],
  sections: [
    {
      title: 'Выполнение ИОТ',
      facts: [
        ['Маршрутов ИОТ', 0],
        ['Средний прогресс', null],
      ],
    },
    {
      title: 'Статистики группы',
      table: {
        header: ['Показатель', 'n', 'Среднее'],
        rows: [
          ['Прогресс ИОТ, %', 0, null],
          ['=cmd', 2, 3.5],
        ],
      },
      note: 'Пропуски в расчёт не входят.',
    },
  ],
};

describe('Отображение отчётов', () => {
  it('FR-080: PDF формируется со шрифтом, содержащим кириллицу', async () => {
    const pdf = await renderReport(report, ReportFormat.PDF);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('FR-080: XLSX — лист «Сводка» с реквизитами и лист на каждую таблицу', async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await renderReport(report, ReportFormat.XLSX)) as never);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Сводка', 'Статистики группы']);
    const summary = book.getWorksheet('Сводка')!;
    expect(summary.getRow(1).getCell(1).value).toBe('Отчёт по группе');
    expect(summary.getRow(4).getCell(2).value).toBe('Иванова Мария Петровна');
    // Пропуск — «Нет данных», ноль остаётся нулём, формула не исполняется.
    const table = book.getWorksheet('Статистики группы')!;
    expect(table.getRow(2).getCell(2).value).toBe(0);
    expect(table.getRow(2).getCell(3).value).toBe('Нет данных');
    expect(table.getRow(3).getCell(1).value).toBe("'=cmd");
  });
});
