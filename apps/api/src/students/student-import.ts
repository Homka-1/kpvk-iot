import {
  STUDENT_IMPORT_COLUMNS,
  STUDENT_IMPORT_MAX_ROWS,
  type StudentImportField,
} from '@iot/shared';
import { type ParsedImportFile, parseTableFile } from '../common/table-import.js';

/** Допустимые заголовки колонок (без учёта регистра, «ё» = «е»). */
const HEADER_ALIASES: Record<StudentImportField, string[]> = {
  lastName: ['фамилия', 'lastname', 'last name'],
  firstName: ['имя', 'firstname', 'first name'],
  middleName: ['отчество', 'middlename', 'middle name'],
  groupName: ['группа', 'group'],
  participantCode: ['код участника', 'код', 'participantcode', 'participant code', 'code'],
  login: ['логин', 'login'],
};

const COLUMNS = STUDENT_IMPORT_COLUMNS.map((column) => ({
  ...column,
  aliases: HEADER_ALIASES[column.key],
}));

/** Разбор файла импорта студентов (FR-006). */
export function parseImportFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedImportFile<StudentImportField>> {
  return parseTableFile(buffer, fileName, {
    columns: COLUMNS,
    maxRows: STUDENT_IMPORT_MAX_ROWS,
    emptyMessage: 'В файле нет строк со студентами',
  });
}
