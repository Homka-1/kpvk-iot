import { ApiProperty } from '@nestjs/swagger';
import {
  type DemoJobDto as DemoJob,
  DemoJobKind,
  DemoJobStatus,
  DemoStage,
  type DemoStatusDto as DemoStatus,
} from '@iot/shared';
import { IsBoolean } from 'class-validator';

export class DemoModeDto {
  @ApiProperty({ description: 'Показывать на сайте демонстрационные данные' })
  @IsBoolean({ message: 'Укажите true или false' })
  active!: boolean;
}

export class DemoJobDto implements DemoJob {
  @ApiProperty({ enum: Object.values(DemoJobKind) })
  kind!: DemoJobKind;

  @ApiProperty({ enum: Object.values(DemoJobStatus) })
  status!: DemoJobStatus;

  @ApiProperty({ type: String, nullable: true, description: 'Текущий шаг или итог' })
  step!: string | null;

  @ApiProperty({ type: String, nullable: true })
  error!: string | null;

  @ApiProperty()
  startedAt!: string;

  @ApiProperty({ type: String, nullable: true })
  finishedAt!: string | null;
}

class DemoPeriodDto {
  @ApiProperty({ example: '2025-10-01' })
  from!: string;

  @ApiProperty({ example: '2026-04-30' })
  to!: string;
}

export class DemoStatusDto implements DemoStatus {
  @ApiProperty({ description: 'Сайт показывает демонстрационные данные' })
  active!: boolean;

  @ApiProperty({ description: 'Копия базы данных существует' })
  exists!: boolean;

  @ApiProperty({ enum: Object.values(DemoStage), description: 'Что сгенерировано в копии' })
  stage!: DemoStage;

  @ApiProperty({ type: DemoJobDto, nullable: true })
  job!: DemoJobDto | null;

  @ApiProperty({ type: DemoPeriodDto, description: 'Период исследования' })
  period!: DemoPeriodDto;
}
