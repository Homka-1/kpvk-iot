import { checkFile, fileExtension } from './file-signature.js';

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1');
const zip = (...names: string[]) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(names.join('\0'), 'latin1')]);

describe('Проверка загружаемых файлов по содержимому (п. 8.3)', () => {
  it('п. 8.3: файл из белого списка с подходящим содержимым принимается, MIME — по формату', () => {
    expect(checkFile('Конспект.PDF', PDF)).toEqual({
      ok: true,
      extension: 'pdf',
      mimeType: 'application/pdf',
    });
    expect(checkFile('схема.png', PNG)).toMatchObject({ ok: true, mimeType: 'image/png' });
    expect(checkFile('план.txt', Buffer.from('Тема 1. Уравнения\n'))).toMatchObject({ ok: true });
  });

  it('п. 8.3: расширение вне белого списка отклоняется', () => {
    expect(checkFile('setup.exe', EXE)).toEqual({ ok: false, reason: 'extension' });
    expect(checkFile('page.html', Buffer.from('<script></script>'))).toEqual({
      ok: false,
      reason: 'extension',
    });
    expect(checkFile('без-расширения', PDF)).toEqual({ ok: false, reason: 'extension' });
  });

  it('п. 8.3: переименованный файл (содержимое не совпадает с расширением) отклоняется', () => {
    expect(checkFile('отчёт.pdf', EXE)).toEqual({ ok: false, reason: 'content' });
    expect(checkFile('фото.jpg', PNG)).toEqual({ ok: false, reason: 'content' });
    expect(checkFile('текст.txt', PNG)).toEqual({ ok: false, reason: 'content' });
  });

  it('п. 8.3: документы Office Open XML различаются по внутренней структуре архива', () => {
    const docx = zip('[Content_Types].xml', 'word/document.xml');
    expect(checkFile('работа.docx', docx)).toMatchObject({ ok: true });
    expect(checkFile('работа.xlsx', docx)).toEqual({ ok: false, reason: 'content' });
    expect(checkFile('архив.docx', zip('readme.txt'))).toEqual({ ok: false, reason: 'content' });
  });

  it('п. 8.3: пустой файл отклоняется', () => {
    expect(checkFile('пусто.pdf', Buffer.alloc(0))).toEqual({ ok: false, reason: 'empty' });
  });

  it('расширение берётся после последней точки, без учёта регистра', () => {
    expect(fileExtension('отчёт.final.DOCX')).toBe('docx');
    expect(fileExtension('README')).toBe('');
  });
});
