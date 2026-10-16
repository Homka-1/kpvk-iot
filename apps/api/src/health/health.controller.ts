import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@iot/shared';
import { Public } from '../auth/decorators.js';

class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok'], description: 'Состояние сервиса' })
  status: 'ok';
}

@ApiTags('Служебное')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Проверка работоспособности API' })
  @ApiOkResponse({ type: HealthResponseDto, description: 'Сервис работает' })
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
