const BOM = String.fromCharCode(0xfeff);

/** Сохранение CSV, сформированного в браузере (BOM и «;» — чтобы файл корректно открывал Excel). */
export function downloadCsv(fileName: string, rows: string[][]): void {
  const escape = (value: string) =>
    /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const text = `${BOM}${rows.map((row) => row.map(escape).join(';')).join('\r\n')}\r\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
