import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type GroupDto, Permission } from '@iot/shared';
import {
  type AuthUser,
  RequireAnyPermission,
  RequirePermissions,
  User,
} from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import { GroupInputDto, GroupListQueryDto, GroupResponseDto } from './groups.dto.js';
import { GroupsService } from './groups.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Учебные группы')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @RequireAnyPermission(Permission.GROUPS_MANAGE, Permission.STUDENTS_READ)
  @ApiOperation({
    summary: 'Список групп',
    description: 'Администратору — все группы, преподавателю — закреплённые за ним (FR-002).',
  })
  @ApiOkResponse({ type: [GroupResponseDto] })
  list(@Query() query: GroupListQueryDto, @User() user: AuthUser): Promise<GroupDto[]> {
    return this.groups.list(user, query.includeArchived);
  }

  @Post()
  @RequirePermissions(Permission.GROUPS_MANAGE)
  @ApiOperation({ summary: 'Создание группы' })
  @ApiCreatedResponse({ type: GroupResponseDto })
  create(@Body() dto: GroupInputDto, @User() actor: AuthUser): Promise<GroupDto> {
    return this.groups.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.GROUPS_MANAGE)
  @ApiOperation({ summary: 'Изменение названия, курса и специальности группы' })
  @ApiOkResponse({ type: GroupResponseDto })
  update(@Param('id', uuid) id: string, @Body() dto: GroupInputDto): Promise<GroupDto> {
    return this.groups.update(id, dto);
  }

  @Post(':id/archive')
  @RequirePermissions(Permission.GROUPS_MANAGE)
  @HttpCode(200)
  @ApiOperation({ summary: 'Архивирование группы без действующих студентов' })
  @ApiOkResponse({ type: GroupResponseDto })
  archive(@Param('id', uuid) id: string, @Body() dto: ReasonDto): Promise<GroupDto> {
    return this.groups.archive(id, dto.reason);
  }

  @Post(':id/restore')
  @RequirePermissions(Permission.GROUPS_MANAGE)
  @HttpCode(200)
  @ApiOperation({ summary: 'Возврат группы из архива' })
  @ApiOkResponse({ type: GroupResponseDto })
  restore(@Param('id', uuid) id: string): Promise<GroupDto> {
    return this.groups.restore(id);
  }
}
