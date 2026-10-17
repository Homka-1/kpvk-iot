import ExcelJS from 'exceljs';
import { parseImportFile } from './student-import.js';

function cp1251(text: string): Buffer {
  // Кириллица Windows-1251: А–я = 0xC0–0xFF, Ё = 0xA8, ё = 0xB8.
  const bytes = [...text].map((char) => {
    const code = char.charCodeAt(0);
    if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
    if (char === 'Ё') return 0xa8;
    if (char === 'ё') return 0xb8;
    return code;
  });
  return Buffer.from(bytes);
}

describe('Разбор файла импорта студентов', () => {
  it('FR-006: CSV в UTF-8 с BOM, запятая, заголовки без учёта регистра', async () => {
    const csv =
      '﻿ФАМИЛИЯ,имя,Отчество,Группа\nПетров,Иван,,ПО-21\n,,,\nСидорова,Анна,Ивановна,по-21\n';
    const result = await parseImportFile(Buffer.from(csv, 'utf8'), 'students.csv');
    expect(result.fileErrors).toEqual([]);
    expect(result.rows).toEqual([
      {
        line: 2,
        values: {
          lastName: 'Петров',
          firstName: 'Иван',
          middleName: '',
          groupName: 'ПО-21',
          participantCode: '',
          login: '',
        },
      },
      {
        line: 4,
        values: {
          lastName: 'Сидорова',
          firstName: 'Анна',
          middleName: 'Ивановна',
          groupName: 'по-21',
          participantCode: '',
          login: '',
        },
      },
    ]);
  });

  it('FR-006: CSV из русского Excel — Windows-1251 и точка с запятой', async () => {
    const csv = 'Фамилия;Имя;Группа;Код участника\r\nЁлкина;Алёна;ПО-21;P-0001\r\n';
    const result = await parseImportFile(cp1251(csv), 'Список.CSV');
    expect(result.rows[0]!.values).toMatchObject({
      lastName: 'Ёлкина',
      firstName: 'Алёна',
      groupName: 'ПО-21',
      participantCode: 'P-0001',
    });
  });

  it('FR-006: XLSX — первый лист, номера строк как в файле', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Студенты');
    sheet.addRow(['Фамилия', 'Имя', 'Группа', 'Логин']);
    sheet.addRow(['Петров', 'Иван', 'ПО-21', 'i.petrov']);
    sheet.addRow([]);
    sheet.addRow(['Ким', 'Алина', 'ПО-22', '']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseImportFile(buffer, 'students.xlsx');
    expect(result.fileErrors).toEqual([]);
    expect(result.rows.map((row) => [row.line, row.values.lastName, row.values.login])).toEqual([
      [2, 'Петров', 'i.petrov'],
      [4, 'Ким', ''],
    ]);
  });

  it('FR-006: нет обязательных колонок — ошибка файла', async () => {
    const result = await parseImportFile(Buffer.from('Фамилия;Имя\nПетров;Иван\n'), 'a.csv');
    expect(result.rows).toEqual([]);
    expect(result.fileErrors).toEqual(['Нет обязательных колонок: «Группа»']);
  });

  it('FR-006: тип файла проверяется по содержимому, а не только по расширению', async () => {
    await expect(parseImportFile(Buffer.from('Фамилия;Имя;Группа\n'), 'a.xlsx')).rejects.toThrow(
      'Поддерживаются файлы CSV и XLSX',
    );
    await expect(
      parseImportFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]), 'a.csv'),
    ).rejects.toThrow('Поддерживаются файлы CSV и XLSX');
    await expect(parseImportFile(Buffer.from('x'), 'a.txt')).rejects.toThrow(
      'Поддерживаются файлы CSV и XLSX',
    );
  });

  it('FR-006: пустой файл и файл без строк', async () => {
    expect((await parseImportFile(Buffer.from(''), 'a.csv')).fileErrors).toEqual([
      'Файл пуст: нет строки заголовков',
    ]);
    expect(
      (await parseImportFile(Buffer.from('Фамилия;Имя;Группа\n'), 'a.csv')).fileErrors,
    ).toEqual(['В файле нет строк со студентами']);
  });
});
