import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { errorForLog } from '../logging/mask.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Фоновое удаление просроченных ключей повторной отправки (NFR-006). Сохранённый ответ формы
 * может содержать персональные данные, поэтому после срока действия ключа он не хранится
 * (п. 8.3). Раз в час и при запуске сервера; в тестовом окружении тесты вызывают `run`.
 */
@Injectable()
export class IdempotencyCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IdempotencyCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => {
      if (this.running) return;
      this.running = this.run()
        .catch((error: unknown) =>
          this.logger.error(
            `Очистка ключей повторной отправки не выполнена: ${errorForLog(error).message}`,
          ),
        )
        .finally(() => (this.running = null));
    };
    tick();
    this.timer = setInterval(tick, CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  /** Удаляет ключи с истёкшим сроком; возвращает их число. */
  async run(now = new Date()): Promise<number> {
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return count;
  }
}
