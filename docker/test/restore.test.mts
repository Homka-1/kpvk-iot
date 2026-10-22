/**
 * AT-13: резервная копия → чистый стенд → восстановление → данные на месте.
 *
 * Тест поднимает рабочую сборку (docker-compose.standalone.yml) отдельным проектом Docker Compose
 * `iot-at13` на портах 18080/18443 с самоподписанным сертификатом, создаёт данные через API
 * (как пользователи), делает резервную копию контейнером backup, удаляет стенд вместе с томами,
 * поднимает его с нуля, восстанавливает копию и проверяет данные: учётные записи с паролями,
 * группу, загруженный файл (побайтно) и журнал аудита.
 *
 * Запуск: `pnpm test:restore` (нужен Docker; первая сборка образов — несколько минут).
 * Рабочие тома и данные других окружений не затрагиваются.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const PROJECT = 'iot-at13';
const BASE_URL = 'https://localhost:18443';
// Самоподписанный сертификат стенда: проверку цепочки отключаем только в этом процессе теста.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const work = mkdtempSync(join(tmpdir(), 'iot-at13-'));
const envFile = join(work, '.env.prod');

function compose(args: string[], options: { check?: boolean } = {}): string {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.standalone.yml',
      '-p',
      PROJECT,
      '--env-file',
      envFile,
      ...args,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if ((options.check ?? true) && result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')}: код ${result.status}\n${result.stderr}`);
  }
  return result.stdout;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout}`);
}

class Api {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  static async login(login: string, password: string): Promise<Api> {
    const response = await request('POST', '/auth/login', { body: { login, password } });
    assert.equal(response.status, 200, `вход «${login}»: ${response.status}`);
    return new Api(((await response.json()) as { accessToken: string }).accessToken);
  }

  /** Вход с временным паролем, его смена и повторный вход с новым паролем. */
  static async firstLogin(login: string, temporary: string, password: string): Promise<Api> {
    const api = await Api.login(login, temporary);
    await api.json('POST', '/auth/change-password', {
      currentPassword: temporary,
      newPassword: password,
    });
    return Api.login(login, password);
  }

  async json<T = Record<string, unknown>>(method: string, path: string, body?: unknown) {
    const response = await this.send(method, path, body);
    assert.ok(
      response.ok,
      `${method} ${path}: ${response.status} ${await response.clone().text()}`,
    );
    return (await response.json()) as T;
  }

  send(method: string, path: string, body?: unknown): Promise<Response> {
    return request(method, path, { body, token: this.token });
  }
}

/**
 * Запрос к API стенда. После пересоздания контейнеров соединение из пула fetch закрыто
 * сервером — такой запрос повторяется один раз по новому соединению.
 */
async function request(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<Response> {
  try {
    return await send(method, path, options);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return send(method, path, options);
  }
}

function send(
  method: string,
  path: string,
  options: { body?: unknown; token?: string },
): Promise<Response> {
  const form = options.body instanceof FormData;
  return fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(form || options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      'Idempotency-Key': `at13-${randomBytes(8).toString('hex')}`,
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: form ? (options.body as FormData) : JSON.stringify(options.body),
  });
}

before(() => {
  run('sh', ['docker/nginx/self-signed-cert.sh', join(work, 'certs'), 'localhost']);
  writeFileSync(
    envFile,
    [
      `IOT_VERSION=at13`,
      `POSTGRES_PASSWORD=${randomBytes(16).toString('hex')}`,
      `JWT_SECRET=${randomBytes(32).toString('hex')}`,
      'HTTP_PORT=18080',
      'HTTPS_PORT=18443',
      `TLS_CERT_DIR=${join(work, 'certs')}`,
      `BACKUP_HOST_DIR=${join(work, 'backups')}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  compose(['down', '--volumes', '--remove-orphans']);
  compose(['up', '--detach', '--build', '--wait']);
});

after(() => {
  // Копии создаёт root в контейнере: удаляем их там же, затем стенд с томами.
  compose(['exec', '-T', 'backup', 'sh', '-c', 'rm -rf /backups/*'], { check: false });
  compose(['down', '--volumes', '--remove-orphans'], { check: false });
  rmSync(work, { recursive: true, force: true });
});

test('AT-13: резервная копия восстанавливается на чистом стенде, данные на месте', async () => {
  // 1. Данные на рабочем стенде.
  const created = compose(['exec', '-T', 'api', 'node', 'dist/cli/create-admin.js']);
  const temporary = /Временный пароль: (\S+)/.exec(created)?.[1];
  assert.ok(temporary, 'create-admin не вывел временный пароль');
  const adminPassword = `Админ-${randomBytes(6).toString('hex')}`;
  const admin = await Api.firstLogin('admin', temporary, adminPassword);

  const group = await admin.json<{ id: string }>('POST', '/groups', {
    name: 'АТ-13',
    course: 1,
    specialty: 'Проверка восстановления',
  });
  const teacherAccount = await admin.json<{ user: { id: string }; temporaryPassword: string }>(
    'POST',
    '/admin/users',
    { login: 'at13-teacher', lastName: 'Проверочный', firstName: 'Педагог', roles: ['teacher'] },
  );
  const teacherPassword = `Педагог-${randomBytes(6).toString('hex')}`;
  const teacher = await Api.firstLogin(
    'at13-teacher',
    teacherAccount.temporaryPassword,
    teacherPassword,
  );
  const content = `Материал для проверки восстановления ${randomBytes(16).toString('hex')}\n`;
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), 'at13.txt');
  const file = await teacher.json<{ id: string }>('POST', '/files', form);
  const auditBefore = await admin.json<{ total: number }>('GET', '/audit-logs');

  // 2. Резервная копия.
  const backupName = compose(['exec', '-T', 'backup', 'backup.sh']).trim().split('\n').at(-1)!;
  assert.match(backupName, /^\d{8}-\d{6}$/);

  // 3. Чистый стенд: тома базы и файлов удалены, миграции применяются к пустой базе.
  compose(['down', '--volumes']);
  compose(['up', '--detach', '--wait']);
  const empty = await request('POST', '/auth/login', {
    body: { login: 'admin', password: adminPassword },
  });
  assert.equal(empty.status, 401, 'на чистом стенде учётной записи ещё нет');

  // 4. Восстановление при остановленном API.
  compose(['stop', 'api']);
  const restored = compose(['exec', '-T', 'backup', 'restore.sh', backupName]);
  assert.match(restored, /готово: восстановлена копия/);
  compose(['up', '--detach', '--wait']);

  // 5. Данные на месте.
  const adminAfter = await Api.login('admin', adminPassword);
  const groups = await adminAfter.json<{ id: string; name: string }[]>('GET', '/groups');
  assert.ok(
    groups.some((item) => item.id === group.id && item.name === 'АТ-13'),
    'группа восстановлена',
  );
  const teacherAfter = await Api.login('at13-teacher', teacherPassword);
  const download = await teacherAfter.send('GET', `/files/${file.id}`);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), content, 'файл восстановлен побайтно');
  const audit = await adminAfter.json<{ items: { action: string; entityId: string | null }[] }>(
    'GET',
    `/audit-logs?entityId=${teacherAccount.user.id}&action=user.created`,
  );
  assert.equal(audit.items.length, 1, 'запись аудита о создании пользователя восстановлена');
  const auditAfter = await adminAfter.json<{ total: number }>('GET', '/audit-logs');
  assert.ok(auditAfter.total >= auditBefore.total, 'журнал аудита не потерял записи');
});
