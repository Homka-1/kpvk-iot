import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  DEFAULT_MOTIVATION_STRATEGIES,
  MOTIVATION_LEVEL_LABELS,
  MOTIVATION_LEVELS,
  type MotivationLevel,
  PROFILE_STAGE_DIFFICULTY,
  STANDARD_TRAJECTORY_STAGES,
} from '@iot/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface CatalogTemplate {
  title: string;
  description: string;
  motivationLevel: MotivationLevel | null;
  isStandard: boolean;
}

/**
 * Системные шаблоны ИОТ: стандартный пятиэтапный (п. 4.6) и варианты под три уровня профиля
 * (FR-035). Этапы вариантов — те же пять этапов п. 4.6; вариант отличается акцентом
 * сопровождения из стратегии уровня (п. 4.5) и рекомендуемой сложностью заданий этапов
 * (PROFILE_STAGE_DIFFICULTY). Содержание вариантов уточняет заказчик
 * (open-questions, вопрос 16).
 */
const CATALOG: CatalogTemplate[] = [
  {
    title: 'Пятиэтапный маршрут (стандартный)',
    description:
      'Стандартная пятиэтапная модель (п. 4.6 ТЗ). Преподаватель адаптирует продолжительность, содержание и результаты этапов.',
    motivationLevel: null,
    isStandard: true,
  },
  ...MOTIVATION_LEVELS.map((level) => ({
    title: `Пятиэтапный маршрут — ${MOTIVATION_LEVEL_LABELS[level].toLowerCase()} мотивации`,
    description: `Пять этапов п. 4.6 ТЗ. Акцент сопровождения: ${DEFAULT_MOTIVATION_STRATEGIES[
      level
    ]
      .join(', ')
      .toLowerCase()}.`,
    motivationLevel: level,
    isStandard: false,
  })),
];

/**
 * Создаёт недостающие системные шаблоны (без автора). Идемпотентна: вызывается при запуске API
 * и в сиде; существующие шаблоны не изменяются.
 */
export async function syncTrajectoryTemplates(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const template of CATALOG) {
      const existing = await tx.trajectoryTemplate.findFirst({
        where: {
          createdById: null,
          isStandard: template.isStandard,
          motivationLevel: template.motivationLevel,
        },
        select: { id: true },
      });
      if (existing) continue;
      await tx.trajectoryTemplate.create({
        data: {
          ...template,
          stages: {
            create: STANDARD_TRAJECTORY_STAGES.map((stage, index) => ({
              ...stage,
              recommendedDifficulty: template.motivationLevel
                ? (PROFILE_STAGE_DIFFICULTY[template.motivationLevel][index] ?? null)
                : null,
              sortOrder: index,
            })),
          },
        },
      });
    }
  });
}

@Injectable()
export class TrajectoryTemplatesCatalogSync implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await syncTrajectoryTemplates(this.prisma);
  }
}
