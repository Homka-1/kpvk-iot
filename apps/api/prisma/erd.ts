// Генерирует docs/architecture/er-diagram.md (mermaid) из prisma/schema.prisma.
// Запуск: pnpm db:erd. Разделы диаграммы соответствуют разделам схемы (комментарии «// ── Название ──»).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Field {
  name: string;
  column: string;
  type: string;
  optional: boolean;
  list: boolean;
  attrs: string;
}

interface Model {
  name: string;
  table: string;
  section: string;
  doc: string;
  fields: Field[];
}

const root = resolve(import.meta.dirname, '../../..');
const schema = readFileSync(resolve(import.meta.dirname, 'schema.prisma'), 'utf8');

const enums = new Set([...schema.matchAll(/^enum (\w+)/gm)].map((m) => m[1]));
const models: Model[] = [];
let section = '';
let doc: string[] = [];
let current: Model | undefined;

for (const raw of schema.split('\n')) {
  const line = raw.trim();
  const sectionMatch = /^\/\/ ─+ (.+?) ─+$/.exec(line);
  if (sectionMatch) {
    section = sectionMatch[1]!;
    continue;
  }
  if (!current) {
    if (line.startsWith('///')) {
      doc.push(line.slice(3).trim());
      continue;
    }
    const modelMatch = /^model (\w+) \{/.exec(line);
    if (modelMatch) {
      const name = modelMatch[1]!;
      current = { name, table: name, section, doc: doc.join(' '), fields: [] };
    }
    doc = [];
    continue;
  }
  if (line === '}') {
    models.push(current);
    current = undefined;
    doc = [];
    continue;
  }
  const tableMatch = /^@@map\("(\w+)"\)/.exec(line);
  if (tableMatch) current.table = tableMatch[1]!;
  const fieldMatch = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
  if (fieldMatch && !line.startsWith('@@') && !line.startsWith('//')) {
    const [, name = '', type = '', list, optional, attrs = ''] = fieldMatch;
    const column = /@map\("(\w+)"\)/.exec(attrs)?.[1] ?? name;
    current.fields.push({ name, column, type, optional: !!optional, list: !!list, attrs });
  }
}

const modelNames = new Set(models.map((m) => m.name));
const tableOf = new Map(models.map((m) => [m.name, m.table]));

/** Связи «многие к одному»: поле с @relation(fields: ...) у дочерней модели. */
function relations(model: Model): { target: string; optional: boolean; label: string }[] {
  return model.fields
    .filter((f) => modelNames.has(f.type) && f.attrs.includes('fields: ['))
    .map((f) => ({ target: f.type, optional: f.optional, label: f.name }));
}

function entity(model: Model): string {
  const rows = model.fields
    .filter((f) => !modelNames.has(f.type))
    .map((f) => {
      const keys = [
        f.attrs.includes('@id') ? 'PK' : '',
        model.fields.some((r) => r.attrs.includes(`fields: [${f.name}]`)) ? 'FK' : '',
        f.attrs.includes('@unique') ? 'UK' : '',
      ]
        .filter(Boolean)
        .join(',');
      const type = (enums.has(f.type) ? `enum_${f.type}` : f.type) + (f.list ? '_list' : '');
      return `    ${type} ${f.column}${keys ? ` ${keys}` : ''}${f.optional ? ' "null"' : ''}`;
    });
  return `  ${model.table} {\n${rows.join('\n')}\n  }`;
}

function relationLine(child: Model, rel: { target: string; optional: boolean; label: string }) {
  const parentCard = rel.optional ? '|o' : '||';
  return `  ${tableOf.get(rel.target)} ${parentCard}--o{ ${child.table} : ${rel.label}`;
}

const sections = [...new Set(models.map((m) => m.section))];
const out: string[] = [
  '# ER-диаграмма базы данных',
  '',
  '> Файл сгенерирован командой `pnpm db:erd` из `apps/api/prisma/schema.prisma`. Не редактируйте вручную.',
  '> Назначение таблиц, жизненные циклы статусов и правила неизменяемости — в [data-model.md](data-model.md).',
  '',
  'Обозначения: `PK` — первичный ключ, `FK` — внешний ключ, `UK` — уникальное поле, `"null"` — поле может быть пустым,',
  '`enum_*` — перечисление PostgreSQL, `*_list` — массив.',
  '',
  '## Общая схема связей',
  '',
  '```mermaid',
  'erDiagram',
  ...models.flatMap((m) => relations(m).map((r) => relationLine(m, r))),
  '```',
];

for (const name of sections) {
  const inSection = models.filter((m) => m.section === name);
  out.push('', `## ${name}`, '');
  for (const m of inSection) out.push(`- \`${m.table}\` — ${m.doc || 'служебная таблица связи.'}`);
  out.push('', '```mermaid', 'erDiagram', ...inSection.map(entity));
  for (const m of inSection) {
    for (const r of relations(m)) {
      if (inSection.some((s) => s.name === r.target)) out.push(relationLine(m, r));
    }
  }
  out.push('```');
}

writeFileSync(resolve(root, 'docs/architecture/er-diagram.md'), `${out.join('\n')}\n`);
console.log(`ER-диаграмма: ${models.length} таблиц, ${sections.length} разделов.`);
