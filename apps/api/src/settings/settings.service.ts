import { BadRequestException, Injectable } from '@nestjs/common';
import { SYSTEM_SETTINGS, type SystemSettingKey, type SystemSettings } from '@iot/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DEFINITIONS = new Map(SYSTEM_SETTINGS.map((definition) => [definition.key, definition]));

/** Системные настройки: значения из БД поверх значений по умолчанию из `@iot/shared`. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getAll(): Promise<SystemSettings> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...DEFINITIONS.keys()] } },
    });
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    return Object.fromEntries(
      SYSTEM_SETTINGS.map(({ key, defaultValue }) => {
        const value = stored.get(key);
        return [key, typeof value === 'number' ? value : defaultValue];
      }),
    ) as SystemSettings;
  }

  async get(key: SystemSettingKey): Promise<number> {
    return (await this.getAll())[key];
  }

  async update(values: Partial<Record<string, unknown>>, actorId: string): Promise<SystemSettings> {
    const fields: Record<string, string> = {};
    const changes: [SystemSettingKey, number][] = [];
    for (const [key, value] of Object.entries(values)) {
      const definition = DEFINITIONS.get(key as SystemSettingKey);
      if (!definition) {
        fields[key] = 'Неизвестная настройка';
      } else if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < definition.min ||
        value > definition.max
      ) {
        fields[key] = `Укажите целое число от ${definition.min} до ${definition.max}`;
      } else {
        changes.push([definition.key, value]);
      }
    }
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ message: 'Проверьте правильность заполнения формы', fields });
    }

    const before = await this.getAll();
    const changed = changes.filter(([key, value]) => before[key] !== value);
    if (changed.length === 0) return before;
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of changed) {
        await tx.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedById: actorId },
          update: { value, updatedById: actorId },
        });
      }
      await this.audit.log(
        {
          action: 'settings.updated',
          entityType: 'settings',
          before: Object.fromEntries(changed.map(([key]) => [key, before[key]])),
          after: Object.fromEntries(changed),
        },
        tx,
      );
    });
    return this.getAll();
  }
}
