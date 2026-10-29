import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@iot/shared';
import { RequirePermissions } from '../auth/decorators.js';
import { DemoModeDto, DemoStatusDto } from './demo.dto.js';
import { DemoService } from './demo.service.js';

@ApiTags('Администрирование')
@ApiBearerAuth()
@Controller('admin/demo')
@RequirePermissions(Permission.USERS_MANAGE)
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get()
  @ApiOperation({ summary: 'Состояние демонстрационного режима' })
  @ApiOkResponse({ type: DemoStatusDto })
  status(): Promise<DemoStatusDto> {
    return this.demo.status();
  }

  @Post('prepare')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Подготовка демонстрационных данных',
    description:
      'Создаёт копию рабочей базы и наполняет её активностью за период исследования до окончания ИОТ (первичный замер). Выполняется в фоне; рабочие данные не изменяются.',
  })
  @ApiAcceptedResponse({ type: DemoStatusDto })
  prepare(): Promise<DemoStatusDto> {
    return this.demo.prepare();
  }

  @Post('repeat')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Повторный замер в демонстрационных данных',
    description: 'Добавляет повторную диагностику после завершения ИОТ. Выполняется в фоне.',
  })
  @ApiAcceptedResponse({ type: DemoStatusDto })
  repeat(): Promise<DemoStatusDto> {
    return this.demo.repeat();
  }

  @Put('mode')
  @ApiOperation({
    summary: 'Включение и выключение демонстрационного отображения',
    description: 'Пока режим включён, все пользователи работают с демонстрационной копией.',
  })
  @ApiOkResponse({ type: DemoStatusDto })
  setMode(@Body() dto: DemoModeDto): Promise<DemoStatusDto> {
    return this.demo.setMode(dto.active);
  }

  @Delete()
  @ApiOperation({ summary: 'Удаление демонстрационных данных и выключение режима' })
  @ApiOkResponse({ type: DemoStatusDto })
  reset(): Promise<DemoStatusDto> {
    return this.demo.reset();
  }
}
