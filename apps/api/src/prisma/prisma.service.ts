import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { databaseRouter } from './database-router.js';

/**
 * Клиент базы данных для модулей приложения. Подключение устанавливается при первом запросе.
 * Обращения к моделям и методам `$…` направляются в базу, выбранную `databaseRouter`
 * (основная или демонстрационная копия); собственные методы сервиса работают с основной базой.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Не задана переменная окружения DATABASE_URL');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
    databaseRouter.registerMain(this);
    return new Proxy(this, {
      get(target, property, receiver) {
        const client = databaseRouter.current();
        if (!client || client === target || Object.hasOwn(PrismaService.prototype, property)) {
          return Reflect.get(target, property, receiver);
        }
        const value: unknown = Reflect.get(client, property, client);
        return typeof value === 'function' ? value.bind(client) : value;
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
