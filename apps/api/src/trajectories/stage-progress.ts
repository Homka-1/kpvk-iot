import { nextStageStatus, StageStatus } from '@iot/shared';
import type { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/**
 * Учёт выполнения этапа ИОТ (FR-042): статус этапа по его заданиям; завершённый текущий этап
 * уступает место следующему. Маршрут и его версия при этом не меняются — это ход выполнения,
 * а не корректировка (FR-043). Итоговое завершение ИОТ остаётся за преподавателем (FR-044).
 */
export async function syncStageProgress(tx: Tx, stageId: string | null): Promise<void> {
  if (!stageId) return;
  const stage = await tx.trajectoryStage.findUnique({
    where: { id: stageId },
    select: {
      status: true,
      archivedAt: true,
      trajectoryId: true,
      assignments: { select: { status: true } },
      checkpoints: { select: { status: true } },
      trajectory: { select: { currentStageId: true } },
    },
  });
  if (!stage || stage.archivedAt) return;
  const next = nextStageStatus(
    stage.status,
    stage.assignments.map((item) => item.status),
    stage.checkpoints.map((item) => item.status),
  );
  if (next === stage.status) return;
  const completed = next === StageStatus.COMPLETED;
  await tx.trajectoryStage.update({
    where: { id: stageId },
    data: { status: next, completedAt: completed ? new Date() : null },
  });
  if (completed && stage.trajectory.currentStageId === stageId) {
    await syncCurrentStage(tx, stage.trajectoryId);
  }
}

/**
 * Текущий этап маршрута — первый по порядку незавершённый действующий этап; он переводится
 * в «В работе». Нужен, когда текущий этап завершён, убран или переставлен корректировкой.
 * Если все этапы завершены, текущим остаётся прежний действующий этап.
 */
export async function syncCurrentStage(tx: Tx, trajectoryId: string): Promise<void> {
  const [trajectory, next] = await Promise.all([
    tx.trajectory.findUniqueOrThrow({
      where: { id: trajectoryId },
      select: { currentStage: { select: { id: true, archivedAt: true } } },
    }),
    tx.trajectoryStage.findFirst({
      where: { trajectoryId, archivedAt: null, status: { not: StageStatus.COMPLETED } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, status: true },
    }),
  ]);
  const current = trajectory.currentStage;
  if (!next) {
    if (current?.archivedAt) {
      const last = await tx.trajectoryStage.findFirst({
        where: { trajectoryId, archivedAt: null },
        orderBy: { sortOrder: 'desc' },
        select: { id: true },
      });
      await tx.trajectory.update({
        where: { id: trajectoryId },
        data: { currentStageId: last?.id ?? null },
      });
    }
    return;
  }
  if (current?.id !== next.id) {
    await tx.trajectory.update({ where: { id: trajectoryId }, data: { currentStageId: next.id } });
  }
  if (next.status === StageStatus.NOT_STARTED) {
    await tx.trajectoryStage.update({
      where: { id: next.id },
      data: { status: StageStatus.IN_PROGRESS },
    });
  }
}
