import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, SYSTEM_SETTINGS, type SystemSettings } from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { SettingsService } from './settings.service.js';

class SettingDefinitionDto {
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty() description: string;
  @ApiProperty() unit: string;
  @ApiProperty() min: number;
  @ApiProperty() max: number;
  @ApiProperty() defaultValue: number;
  @ApiProperty({ description: 'Текущее значение' }) value: number;
}

const settingsExample = Object.fromEntries(SYSTEM_SETTINGS.map((s) => [s.key, s.defaultValue]));

@ApiTags('Настройки')
@ApiBearerAuth()
@Controller('settings')
@RequirePermissions(Permission.SETTINGS_MANAGE)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Системные настройки с описанием и допустимыми значениями' })
  @ApiOkResponse({ type: [SettingDefinitionDto] })
  async list(): Promise<SettingDefinitionDto[]> {
    return this.describe(await this.settings.getAll());
  }

  @Patch()
  @ApiOperation({ summary: 'Изменение системных настроек (записывается в журнал аудита)' })
  @ApiBody({
    description: 'Ключ настройки → новое значение',
    schema: { type: 'object', additionalProperties: { type: 'integer' }, example: settingsExample },
  })
  @ApiOkResponse({ type: [SettingDefinitionDto] })
  async update(
    @Body() body: Record<string, unknown>,
    @User() user: AuthUser,
  ): Promise<SettingDefinitionDto[]> {
    return this.describe(await this.settings.update(body, user.id));
  }

  private describe(values: SystemSettings): SettingDefinitionDto[] {
    return SYSTEM_SETTINGS.map((definition) => ({ ...definition, value: values[definition.key] }));
  }
}
