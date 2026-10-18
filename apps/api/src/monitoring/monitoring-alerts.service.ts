import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  ASSIGNMENT_SUBMITTABLE_STATUSES,
  formatFullName,
  localDate,
  TRAJECTORY_CORRECTABLE_STATUSES,
} from '@iot/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Как часто фоновая задача проверяет сроки. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface AlertsRunResult {
  missedCheckpoints: number;
  overdueAssignments: number;
}

/**
 * Предупреждения мониторинга (FR-058) — фоновая задача. Раз в час и при запуске сервера:
 * контрольные точки действующих ИОТ, срок которых прошёл, отмечаются пропущенными; о каждой
 * пропущенной точке и каждом просроченном задании преподаватель маршрута получает одно
 * уведомление. Повторный запуск уведомления не дублирует. В тестовом окружении задача сама
 * не запускается — тесты вызывают `run`.
 */
@Injectable()
export class MonitoringAlertsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MonitoringAlertsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => {
      if (this.running) return;
      this.running = this.run()
        .catch((error: unknown) =>
          this.logger.error(`Проверка сроков не выполнена: ${String(error)}`),
        )
        .finally(() => (this.running = null));
    };
    tick();
    this.timer = setInterval(tick, CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  async run(now = new Date()): Promise<AlertsRunResult> {
    const active = { status: { in: [...TRAJECTORY_CORRECTABLE_STATUSES] } };
    const today = new Date(localDate(now.toISOString()));

    const checkpoints = await this.prisma.trajectoryCheckpoint.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: today },
        stage: { archivedAt: null, trajectory: active },
      },
      select: {
        id: true,
        title: true,
        stage: {
          select: {
            title: true,
            trajectory: {
              select: {
                id: true,
                teacherId: true,
                student: { select: { lastName: true, firstName: true, middleName: true } },
              },
            },
          },
        },
      },
    });
    let missed = 0;
    for (const checkpoint of checkpoints) {
      const trajectory = checkpoint.stage.trajectory;
      await this.prisma.$transaction(async (tx) => {
        const marked = await tx.trajectoryCheckpoint.updateMany({
          where: { id: checkpoint.id, status: 'PENDING' },
          data: { status: 'MISSED' },
        });
        if (marked.count === 0) return;
        missed += 1;
        await tx.notification.create({
          data: {
            userId: trajectory.teacherId,
            type: 'checkpoint.missed',
            title: 'Пропущена контрольная точка',
            body: `${formatFullName(trajectory.student)} · этап «${checkpoint.stage.title}» · ${checkpoint.title}`,
            link: `/monitoring/${trajectory.id}`,
            entityType: 'trajectory_checkpoint',
            entityId: checkpoint.id,
          },
        });
        await this.audit.log(
          {
            actorId: null,
            action: 'trajectory.checkpoint_missed',
            entityType: 'trajectory',
            entityId: trajectory.id,
            after: { checkpointId: checkpoint.id, status: 'MISSED' },
          },
          tx,
        );
      });
    }

    const overdue = await this.prisma.trajectoryAssignment.findMany({
      where: {
        status: { in: [...ASSIGNMENT_SUBMITTABLE_STATUSES] },
        dueAt: { lt: now },
        trajectory: active,
      },
      select: {
        id: true,
        assignment: { select: { title: true } },
        student: { select: { lastName: true, firstName: true, middleName: true } },
        trajectory: { select: { id: true, teacherId: true } },
      },
    });
    const notified = new Set(
      (
        await this.prisma.notification.findMany({
          where: {
            type: 'assignment.overdue',
            entityId: { in: overdue.map((item) => item.id) },
          },
          select: { entityId: true },
        })
      ).map((item) => item.entityId),
    );
    const fresh = overdue.filter((item) => !notified.has(item.id) && item.trajectory);
    if (fresh.length > 0) {
      await this.prisma.notification.createMany({
        data: fresh.map((item) => ({
          userId: item.trajectory!.teacherId,
          type: 'assignment.overdue',
          title: 'Просрочено задание',
          body: `${formatFullName(item.student)} · ${item.assignment.title}`,
          link: `/monitoring/${item.trajectory!.id}`,
          entityType: 'trajectory_assignment',
          entityId: item.id,
        })),
      });
    }
    return { missedCheckpoints: missed, overdueAssignments: fresh.length };
  }
}
