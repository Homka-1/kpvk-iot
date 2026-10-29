import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Выбор базы данных для запросов приложения: основная или демонстрационная копия.
 * Демо-режим включает администратор (модуль demo); пока он включён, все запросы идут в копию.
 * Внутри `runWith` база задаётся явно — так генератор демо-активности пишет в копию
 * при выключенном режиме, а модуль demo читает свои настройки из основной базы.
 */
class DatabaseRouter {
  private readonly storage = new AsyncLocalStorage<PrismaClient>();
  private mainClient: PrismaClient | null = null;
  private demoClient: PrismaClient | null = null;

  /** Клиент для текущего запроса; null — основная база. */
  current(): PrismaClient | null {
    return this.storage.getStore() ?? this.demoClient;
  }

  registerMain(client: PrismaClient): void {
    this.mainClient = client;
  }

  get main(): PrismaClient {
    if (!this.mainClient) throw new Error('Подключение к основной базе данных не создано');
    return this.mainClient;
  }

  /** Включает (клиент копии) или выключает (null) демо-режим для всех запросов. */
  setDemo(client: PrismaClient | null): void {
    this.demoClient = client;
  }

  get demoActive(): boolean {
    return this.demoClient !== null;
  }

  runWith<T>(client: PrismaClient, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(client, fn);
  }
}

export const databaseRouter = new DatabaseRouter();
