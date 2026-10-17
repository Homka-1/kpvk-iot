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
import {
  type DisciplineDto,
  Permission,
  type PersonRef,
  type TeacherAssignmentDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { ReasonDto } from '../common/dto.js';
import {
  DisciplineInputDto,
  DisciplineListQueryDto,
  DisciplineResponseDto,
  PersonRefDto,
  TeacherAssignmentInputDto,
  TeacherAssignmentListQueryDto,
  TeacherAssignmentResponseDto,
} from './disciplines.dto.js';
import { DisciplinesService } from './disciplines.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Дисциплины')
@ApiBearerAuth()
@Controller('disciplines')
export class DisciplinesController {
  constructor(private readonly disciplines: DisciplinesService) {}

  @Get()
  @RequirePermissions(Permission.DISCIPLINES_READ)
  @ApiOperation({
    summary: 'Список дисциплин',
    description:
      'Администратору — все дисциплины, преподавателю — свои, с группами из его закреплений (FR-002).',
  })
  @ApiOkResponse({ type: [DisciplineResponseDto] })
  list(@Query() query: DisciplineListQueryDto, @User() user: AuthUser): Promise<DisciplineDto[]> {
    return this.disciplines.list(user, query.includeArchived);
  }

  @Post()
  @RequirePermissions(Permission.DISCIPLINES_MANAGE)
  @ApiOperation({ summary: 'Создание дисциплины' })
  @ApiCreatedResponse({ type: DisciplineResponseDto })
  create(@Body() dto: DisciplineInputDto, @User() actor: AuthUser): Promise<DisciplineDto> {
    return this.disciplines.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DISCIPLINES_MANAGE)
  @ApiOperation({ summary: 'Изменение дисциплины' })
  @ApiOkResponse({ type: DisciplineResponseDto })
  update(@Param('id', uuid) id: string, @Body() dto: DisciplineInputDto): Promise<DisciplineDto> {
    return this.disciplines.update(id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions(Permission.DISCIPLINES_MANAGE)
  @ApiOperation({ summary: 'Архивирование дисциплины без действующих закреплений' })
  @ApiOkResponse({ type: DisciplineResponseDto })
  archive(@Param('id', uuid) id: string, @Body() dto: ReasonDto): Promise<DisciplineDto> {
    return this.disciplines.archive(id, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermissions(Permission.DISCIPLINES_MANAGE)
  @ApiOperation({ summary: 'Возврат дисциплины из архива' })
  @ApiOkResponse({ type: DisciplineResponseDto })
  restore(@Param('id', uuid) id: string): Promise<DisciplineDto> {
    return this.disciplines.restore(id);
  }
}

@ApiTags('Дисциплины')
@ApiBearerAuth()
@Controller('teacher-assignments')
@RequirePermissions(Permission.DISCIPLINES_MANAGE)
export class TeacherAssignmentsController {
  constructor(private readonly disciplines: DisciplinesService) {}

  @Get()
  @ApiOperation({ summary: 'Закрепления преподавателей за группами и дисциплинами' })
  @ApiOkResponse({ type: [TeacherAssignmentResponseDto] })
  list(@Query() query: TeacherAssignmentListQueryDto): Promise<TeacherAssignmentDto[]> {
    return this.disciplines.listAssignments(query.includeEnded);
  }

  @Get('teachers')
  @ApiOperation({ summary: 'Активные преподаватели для закрепления' })
  @ApiOkResponse({ type: [PersonRefDto] })
  teachers(): Promise<PersonRef[]> {
    return this.disciplines.listTeachers();
  }

  @Post()
  @ApiOperation({
    summary: 'Закрепление преподавателя за группой и дисциплиной',
    description: 'Открывает преподавателю доступ к студентам группы (FR-002).',
  })
  @ApiCreatedResponse({ type: TeacherAssignmentResponseDto })
  create(
    @Body() dto: TeacherAssignmentInputDto,
    @User() actor: AuthUser,
  ): Promise<TeacherAssignmentDto> {
    return this.disciplines.createAssignment(dto, actor.id);
  }

  @Post(':id/end')
  @HttpCode(200)
  @ApiOperation({ summary: 'Снятие закрепления (история сохраняется)' })
  @ApiOkResponse({ type: TeacherAssignmentResponseDto })
  end(@Param('id', uuid) id: string, @Body() dto: ReasonDto): Promise<TeacherAssignmentDto> {
    return this.disciplines.endAssignment(id, dto.reason);
  }
}
