import {
  ConflictException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  type DemoJobDto,
  DemoJobKind,
  DemoJobStatus,
  DemoStage,
  type DemoStatusDto,
} from '@iot/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { errorForLog } from '../logging/mask.js';
import { databaseRouter } from '../prisma/database-router.js';
import { DemoActivityGenerator } from './demo-activity.js';
import { DEMO_PERIOD } from './demo-catalog.js';
import { DemoDatabase } from './demo-database.js';

/** Включён ли демо-режим: хранится в основной базе, чтобы пережить перезапуск API. */
const MODE_KEY = 'demo.mode';

/**
 * Демо-режим: подготовка копии рабочей базы с активностью за период исследования, повторный
 * замер, переключение сайта на копию и обратно, удаление копии. Подготовка и повторный замер
 * выполняются в фоне; ход работы виден в статусе. Рабочие данные при этом не изменяются.
 */
@Injectable()
export class DemoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoService.name);
  private databaseInstance: DemoDatabase | null = null;
  private client: PrismaClient | null = null;
  private job: DemoJobDto | null = null;

  constructor(private readonly generator: DemoActivityGenerator) {}

  /** После перезапуска API включённый демо-режим восстанавливается (с миграциями копии). */
  async onModuleInit(): Promise<void> {
    try {
      const mode = await databaseRouter.main.systemSetting.findUnique({ where: { key: MODE_KEY } });
      if (mode?.value !== true) return;
      if (!(await this.database.exists(databaseRouter.main))) return;
      await this.database.migrate();
      databaseRouter.setDemo(this.demoClient());
    } catch (error) {
      this.logger.error(`Демо-режим не восстановлен: ${errorForLog(error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    databaseRouter.setDemo(null);
    await this.client?.$disconnect();
  }

  async status(): Promise<DemoStatusDto> {
    const exists = await this.database.exists(databaseRouter.main);
    let stage: DemoStage = DemoStage.NONE;
    if (exists && this.job?.status !== DemoJobStatus.RUNNING) {
      try {
        const state = await databaseRouter.runWith(this.demoClient(), () =>
          this.generator.readState(),
        );
        stage = state?.stage ?? DemoStage.NONE;
      } catch {
        // Копия создаётся или повреждена: данных для показа нет.
      }
    }
    return {
      active: databaseRouter.demoActive,
      exists,
      stage,
      job: this.job,
      period: { from: DEMO_PERIOD.researchFrom, to: DEMO_PERIOD.researchTo },
    };
  }

  /** Новая копия рабочей базы и активность до окончания ИОТ (первичный замер). */
  async prepare(): Promise<DemoStatusDto> {
    this.assertIdle();
    if (databaseRouter.demoActive) {
      throw new ConflictException('Выключите демо-отображение, чтобы подготовить данные заново');
    }
    this.start(DemoJobKind.PREPARE, async (step) => {
      step('Создание копии базы данных');
      await this.closeClient();
      await this.database.create(databaseRouter.main);
      const client = this.demoClient();
      step('Копирование рабочих данных');
      await this.database.copyFrom(databaseRouter.main, client);
      await client.systemSetting.deleteMany({ where: { key: { startsWith: 'demo.' } } });
      await databaseRouter.runWith(client, () => this.generator.generatePrimary(Math.random, step));
    });
    return this.status();
  }

  /** Повторный замер после завершения ИОТ. */
  async repeat(): Promise<DemoStatusDto> {
    this.assertIdle();
    const status = await this.status();
    if (status.stage !== DemoStage.PRIMARY) {
      throw new ConflictException(
        status.stage === DemoStage.REPEATED
          ? 'Повторный замер уже проведён'
          : 'Сначала подготовьте демо-данные с первичным замером',
      );
    }
    this.start(DemoJobKind.REPEAT, async (step) => {
      await databaseRouter.runWith(this.demoClient(), () =>
        this.generator.generateRepeated(Math.random, step),
      );
    });
    return this.status();
  }

  async setMode(active: boolean): Promise<DemoStatusDto> {
    this.assertIdle();
    if (active) {
      const status = await this.status();
      if (status.stage === DemoStage.NONE) {
        throw new ConflictException('Сначала подготовьте демо-данные');
      }
      await this.database.migrate();
      databaseRouter.setDemo(this.demoClient());
    } else {
      databaseRouter.setDemo(null);
    }
    await databaseRouter.main.systemSetting.upsert({
      where: { key: MODE_KEY },
      create: { key: MODE_KEY, value: active },
      update: { value: active },
    });
    return this.status();
  }

  /** Выключает демо-отображение и удаляет копию. */
  async reset(): Promise<DemoStatusDto> {
    this.assertIdle();
    await this.setMode(false);
    await this.closeClient();
    await this.database.drop(databaseRouter.main);
    this.job = null;
    return this.status();
  }

  // ── Внутреннее ──

  private get database(): DemoDatabase {
    if (!this.databaseInstance) {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('Не задана переменная окружения DATABASE_URL');
      this.databaseInstance = new DemoDatabase(url);
    }
    return this.databaseInstance;
  }

  private demoClient(): PrismaClient {
    this.client ??= this.database.connect();
    return this.client;
  }

  private async closeClient(): Promise<void> {
    await this.client?.$disconnect();
    this.client = null;
  }

  private assertIdle(): void {
    if (this.job?.status === DemoJobStatus.RUNNING) {
      throw new ConflictException('Дождитесь окончания текущей операции');
    }
  }

  private start(kind: DemoJobKind, work: (step: (text: string) => void) => Promise<void>): void {
    const job: DemoJobDto = {
      kind,
      status: DemoJobStatus.RUNNING,
      step: null,
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.job = job;
    work((text) => {
      job.step = text;
    })
      .then(() => {
        job.status = DemoJobStatus.DONE;
        job.step = 'Готово';
      })
      .catch((error: unknown) => {
        this.logger.error(`Демо-данные не созданы: ${errorForLog(error).message}`);
        job.status = DemoJobStatus.FAILED;
        job.error = error instanceof Error ? error.message : 'Неизвестная ошибка';
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
      });
  }
}
