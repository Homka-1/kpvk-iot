import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { formatFullName, Permission } from '@iot/shared';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { RequirePermissions } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Код действия (например, user.blocked)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Тип сущности (например, user, settings)' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Идентификатор сущности' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Автор действия' })
  @IsOptional()
  @IsUUID('all', { message: 'Некорректный идентификатор пользователя' })
  actorId?: string;

  @ApiPropertyOptional({ description: 'Начало периода (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'Некорректная дата начала периода' })
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'Некорректная дата окончания периода' })
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 50;
}

class AuditLogItemDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() action: string;
  @ApiProperty() entityType: string;
  @ApiProperty({ nullable: true, type: String }) entityId: string | null;
  @ApiProperty({ nullable: true, type: String }) actorId: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'ФИО автора' })
  actorName: string | null;
  @ApiProperty({ nullable: true, type: Object }) before: unknown;
  @ApiProperty({ nullable: true, type: Object }) after: unknown;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ nullable: true, type: String }) ipAddress: string | null;
}

class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogItemDto] }) items: AuditLogItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

@ApiTags('Администрирование')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'Журнал аудита (новые записи первыми)' })
  @ApiOkResponse({ type: AuditLogPageDto })
  async list(@Query() query: AuditQueryDto): Promise<AuditLogPageDto> {
    const where: Prisma.AuditLogWhereInput = {
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      actorId: query.actorId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: { lastName: true, firstName: true, middleName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map(({ actor, ...row }) => ({
        ...row,
        actorName: actor ? formatFullName(actor) : null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
