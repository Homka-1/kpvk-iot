import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, PERMISSION_DESCRIPTIONS, SENSITIVE_PERMISSIONS } from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateUserDto,
  GrantPermissionDto,
  PermissionDto,
  ReasonDto,
  RoleDto,
  SetRolesDto,
  TemporaryPasswordDto,
  UpdateUserDto,
  UserDetailsDto,
  UserListQueryDto,
  UserPageDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Администрирование')
@ApiBearerAuth()
@Controller('admin/users')
@RequirePermissions(Permission.USERS_MANAGE)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Список учётных записей с поиском и фильтрами' })
  @ApiOkResponse({ type: UserPageDto })
  list(@Query() query: UserListQueryDto): Promise<UserPageDto> {
    return this.users.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Создание учётной записи сотрудника',
    description: 'Возвращает временный пароль, который пользователь сменит при первом входе.',
  })
  @ApiCreatedResponse({ type: TemporaryPasswordDto })
  create(@Body() dto: CreateUserDto, @User() actor: AuthUser): Promise<TemporaryPasswordDto> {
    return this.users.create(dto, actor.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Учётная запись: роли, индивидуальные и итоговые разрешения' })
  @ApiOkResponse({ type: UserDetailsDto })
  get(@Param('id', uuid) id: string): Promise<UserDetailsDto> {
    return this.users.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменение ФИО и e-mail' })
  @ApiOkResponse({ type: UserDetailsDto })
  update(@Param('id', uuid) id: string, @Body() dto: UpdateUserDto): Promise<UserDetailsDto> {
    return this.users.update(id, dto);
  }

  @Post(':id/block')
  @HttpCode(200)
  @ApiOperation({ summary: 'Блокировка учётной записи (все сессии завершаются)' })
  @ApiOkResponse({ type: UserDetailsDto })
  block(
    @Param('id', uuid) id: string,
    @Body() dto: ReasonDto,
    @User() actor: AuthUser,
  ): Promise<UserDetailsDto> {
    return this.users.block(id, dto.reason, actor.id);
  }

  @Post(':id/unblock')
  @HttpCode(200)
  @ApiOperation({ summary: 'Разблокировка, в том числе после неудачных попыток входа' })
  @ApiOkResponse({ type: UserDetailsDto })
  unblock(@Param('id', uuid) id: string, @User() actor: AuthUser): Promise<UserDetailsDto> {
    return this.users.unblock(id, actor.id);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Сброс пароля',
    description: 'Выдаёт временный пароль и завершает все сессии пользователя.',
  })
  @ApiOkResponse({ type: TemporaryPasswordDto })
  resetPassword(
    @Param('id', uuid) id: string,
    @User() actor: AuthUser,
  ): Promise<TemporaryPasswordDto> {
    return this.users.resetPassword(id, actor.id);
  }

  @Put(':id/roles')
  @ApiOperation({ summary: 'Назначение ролей сотрудника' })
  @ApiOkResponse({ type: UserDetailsDto })
  setRoles(
    @Param('id', uuid) id: string,
    @Body() dto: SetRolesDto,
    @User() actor: AuthUser,
  ): Promise<UserDetailsDto> {
    return this.users.setRoles(id, dto.roles, actor.id);
  }

  @Post(':id/permissions')
  @HttpCode(200)
  @RequirePermissions(Permission.USERS_MANAGE, Permission.ROLES_MANAGE)
  @ApiOperation({
    summary: 'Выдача индивидуального разрешения с основанием',
    description:
      'Так выдаётся, например, доступ к диагностическим ответам (п. 2.1 ТЗ) или к персональным ' +
      'данным для исследователя (п. 2.4 ТЗ). Выдать разрешение самому себе нельзя.',
  })
  @ApiOkResponse({ type: UserDetailsDto })
  grant(
    @Param('id', uuid) id: string,
    @Body() dto: GrantPermissionDto,
    @User() actor: AuthUser,
  ): Promise<UserDetailsDto> {
    return this.users.grantPermission(id, dto, actor.id);
  }

  @Delete(':id/permissions/:permission')
  @RequirePermissions(Permission.USERS_MANAGE, Permission.ROLES_MANAGE)
  @ApiOperation({ summary: 'Отзыв индивидуального разрешения' })
  @ApiOkResponse({ type: UserDetailsDto })
  revoke(
    @Param('id', uuid) id: string,
    @Param('permission', new ParseEnumPipe(Permission, { errorHttpStatusCode: 404 }))
    permission: Permission,
    @Body() dto: ReasonDto,
    @User() actor: AuthUser,
  ): Promise<UserDetailsDto> {
    return this.users.revokePermission(id, permission, dto.reason, actor.id);
  }
}

@ApiTags('Администрирование')
@ApiBearerAuth()
@Controller('admin')
@RequirePermissions(Permission.USERS_MANAGE)
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Системные роли и их разрешения (только просмотр)' })
  @ApiOkResponse({ type: [RoleDto] })
  async roles(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
    return roles.map((role) => ({
      code: role.code as RoleDto['code'],
      name: role.name,
      description: role.description,
      permissions: role.permissions.map(({ permission }) => permission.code as Permission).sort(),
    }));
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Каталог разрешений' })
  @ApiOkResponse({ type: [PermissionDto] })
  permissions(): PermissionDto[] {
    return Object.values(Permission).map((code) => ({
      code,
      description: PERMISSION_DESCRIPTIONS[code],
      sensitive: SENSITIVE_PERMISSIONS.includes(code),
    }));
  }
}
