import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type ObservationDto,
  type OwnProfileDto,
  Permission,
  type StudentHistoryItemDto,
  type StudentProfileDto,
  type SupportStatusDetailsDto,
} from '@iot/shared';
import { type AuthUser, RequirePermissions, User } from '../auth/decorators.js';
import { IdempotencyKey } from '../common/idempotency.service.js';
import {
  CreateObservationDto,
  ObservationResponseDto,
  OwnProfileResponseDto,
  StudentHistoryItemResponseDto,
  StudentProfileResponseDto,
  SupportStatusDetailsResponseDto,
  UpdateInterestsDto,
  UpdateObservationDto,
} from './profile.dto.js';
import { StudentProfileService } from './profile.service.js';

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 });

@ApiTags('Профиль студента')
@ApiBearerAuth()
@Controller('students/:id')
@RequirePermissions(Permission.STUDENTS_READ)
export class StudentProfileController {
  constructor(private readonly profiles: StudentProfileService) {}

  @Get('profile')
  @ApiOperation({
    summary:
      'Полная карточка студента: общие сведения, дисциплины и преподаватели (FR-009, FR-012)',
    description: 'Только студенты групп, доступных пользователю (FR-002); иначе 404.',
  })
  @ApiOkResponse({ type: StudentProfileResponseDto })
  profile(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentProfileDto> {
    return this.profiles.getProfile(user, id);
  }

  @Get('observations')
  @ApiOperation({
    summary: 'Педагогические наблюдения о студенте (FR-014)',
    description:
      'Все наблюдения, включая служебные. Доступно только сотрудникам; студенту служебные заметки не передаются (FR-016).',
  })
  @ApiOkResponse({ type: [ObservationResponseDto] })
  observations(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<ObservationDto[]> {
    return this.profiles.listObservations(user, id);
  }

  @Post('observations')
  @RequirePermissions(Permission.OBSERVATIONS_MANAGE)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Ключ формы: повторная отправка не создаёт дублей (NFR-006)',
  })
  @ApiOperation({
    summary: 'Добавление педагогического наблюдения',
    description: 'Автор — текущий пользователь, дата наблюдения — не позже сегодняшней (FR-014).',
  })
  @ApiCreatedResponse({ type: ObservationResponseDto })
  createObservation(
    @Param('id', uuid) id: string,
    @Body() dto: CreateObservationDto,
    @User() user: AuthUser,
    @IdempotencyKey() key: string,
  ): Promise<ObservationDto> {
    return this.profiles.createObservation(user, id, dto, key);
  }

  @Patch('observations/:observationId')
  @RequirePermissions(Permission.OBSERVATIONS_MANAGE)
  @ApiOperation({ summary: 'Изменение наблюдения (только автором)' })
  @ApiOkResponse({ type: ObservationResponseDto })
  updateObservation(
    @Param('id', uuid) id: string,
    @Param('observationId', uuid) observationId: string,
    @Body() dto: UpdateObservationDto,
    @User() user: AuthUser,
  ): Promise<ObservationDto> {
    return this.profiles.updateObservation(user, id, observationId, dto);
  }

  @Get('support-status')
  @ApiOperation({
    summary: 'Пояснение к статусу сопровождения (FR-060)',
    description:
      'Последняя отметка преподавателя с основанием из журнала аудита и число нерассмотренных сообщений о затруднениях.',
  })
  @ApiOkResponse({ type: SupportStatusDetailsResponseDto })
  supportStatus(
    @Param('id', uuid) id: string,
    @User() user: AuthUser,
  ): Promise<SupportStatusDetailsDto> {
    return this.profiles.supportStatus(user, id);
  }

  @Get('history')
  @ApiOperation({
    summary: 'История значимых изменений по студенту',
    description: 'События из журнала аудита: создание, перевод, архив, наблюдения и т. п.',
  })
  @ApiOkResponse({ type: [StudentHistoryItemResponseDto] })
  history(@Param('id', uuid) id: string, @User() user: AuthUser): Promise<StudentHistoryItemDto[]> {
    return this.profiles.history(user, id);
  }
}

@ApiTags('Кабинет студента')
@ApiBearerAuth()
@Controller('cabinet/profile')
@RequirePermissions(Permission.CABINET_ACCESS)
export class CabinetProfileController {
  constructor(private readonly profiles: StudentProfileService) {}

  @Get()
  @ApiOperation({
    summary: '«Мой профиль»: собственные данные студента (п. 2.3, AT-12)',
    description:
      'Только наблюдения, открытые студенту преподавателем; служебные заметки не передаются.',
  })
  @ApiOkResponse({ type: OwnProfileResponseDto })
  get(@User() user: AuthUser): Promise<OwnProfileDto> {
    return this.profiles.getOwn(user);
  }

  @Patch()
  @ApiOperation({ summary: 'Изменение своих интересов (п. 2.3)' })
  @ApiOkResponse({ type: OwnProfileResponseDto })
  update(@Body() dto: UpdateInterestsDto, @User() user: AuthUser): Promise<OwnProfileDto> {
    return this.profiles.updateOwnInterests(user, dto.interests);
  }
}
