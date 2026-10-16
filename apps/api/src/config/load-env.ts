import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config } from 'dotenv';

/** Ищет корень монорепозитория (каталог с pnpm-workspace.yaml) вверх от текущего файла. */
function findWorkspaceRoot(start: string): string | undefined {
  let dir = start;
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return dir;
}

/**
 * Загружает переменные окружения из корневого файла (`.env` или файла из `ENV_FILE`).
 * Уже заданные переменные не перезаписываются: в контейнерах значения приходят извне.
 */
export function loadEnv(defaultFile = '.env'): void {
  const root = findWorkspaceRoot(import.meta.dirname);
  if (!root) return;
  config({ path: resolve(root, process.env.ENV_FILE ?? defaultFile), quiet: true });
}
