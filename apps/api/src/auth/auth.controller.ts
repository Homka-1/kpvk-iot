import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  type CurrentUser,
  Permission,
  PASSWORD_MAX_LENGTH,
  REFRESH_COOKIE,
  RoleCode,
  type SessionResponse,
} from '@iot/shared';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, type IssuedSession } from './auth.service.js';
import { LoginRateLimitGuard } from './login-rate-limit.guard.js';
import { AllowPendingPasswordChange, type AuthUser, Public, User } from './decorators.js';

class LoginDto {
  @ApiProperty({ example: 'teacher' })
  @IsString({ message: 'Введите логин' })
  @IsNotEmpty({ message: 'Введите логин' })
  @MaxLength(64, { message: 'Логин слишком длинный' })
  login: string;

  @ApiProperty({ format: 'password' })
  @IsString({ message: 'Введите пароль' })
  @IsNotEmpty({ message: 'Введите пароль' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'Пароль слишком длинный' })
  password: string;
}

class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString({ message: 'Введите текущий пароль' })
  @IsNotEmpty({ message: 'Введите текущий пароль' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'Пароль слишком длинный' })
  currentPassword: string;

  @ApiProperty({ format: 'password' })
  @IsString({ message: 'Введите новый пароль' })
  @IsNotEmpty({ message: 'Введите новый пароль' })
  newPassword: string;
}

class CurrentUserDto implements CurrentUser {
  @ApiProperty() id: string;
  @ApiProperty() login: string;
  @ApiProperty() lastName: string;
  @ApiProperty() firstName: string;
  @ApiProperty({ nullable: true, type: String }) middleName: string | null;
  @ApiProperty({ enum: Object.values(RoleCode), isArray: true }) roles: RoleCode[];
  @ApiProperty({ enum: Object.values(Permission), isArray: true }) permissions: Permission[];
  @ApiProperty({ description: 'Требуется сменить временный пароль' })
  mustChangePassword: boolean;
}

class SessionResponseDto implements SessionResponse {
  @ApiProperty({ description: 'Access-токен (JWT) для заголовка Authorization: Bearer' })
  accessToken: string;
  @ApiProperty({ description: 'Срок жизни access-токена, секунды' }) expiresIn: number;
  @ApiProperty({ type: CurrentUserDto }) user: CurrentUserDto;
}

const REFRESH_PATH = '/api/auth';

function cookieBase(): CookieOptions {
  return { secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
}

/**
 * Double submit: значение CSRF-cookie должно совпасть с заголовком. Применяется к запросам,
 * которые аутентифицируются cookie (обновление сессии и выход). Остальные запросы
 * используют заголовок Authorization, который браузер не подставляет сам.
 */
function assertCsrf(req: Request): void {
  const cookie = (req.cookies as Record<string, string | undefined>)[CSRF_COOKIE];
  const header = req.header(CSRF_HEADER);
  if (
    !cookie ||
    !header ||
    cookie.length !== header.length ||
    !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
  ) {
    throw new ForbiddenException('Недействительный CSRF-токен. Обновите страницу');
  }
}

function setSessionCookies(res: Response, session: IssuedSession): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieBase(),
    httpOnly: true,
    path: REFRESH_PATH,
    expires: session.refreshExpiresAt,
  });
  res.cookie(CSRF_COOKIE, randomBytes(24).toString('base64url'), {
    ...cookieBase(),
    httpOnly: false,
    expires: session.refreshExpiresAt,
  });
}

function clearSessionCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), httpOnly: true, path: REFRESH_PATH });
  res.clearCookie(CSRF_COOKIE, cookieBase());
}

function refreshTokenOf(req: Request): string | undefined {
  return (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
}

@ApiTags('Авторизация')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @UseGuards(LoginRateLimitGuard)
  @ApiOperation({
    summary: 'Вход по логину и паролю',
    description:
      'Возвращает access-токен и устанавливает httpOnly cookie с refresh-токеном и CSRF-cookie. ' +
      'После нескольких неверных паролей подряд вход временно блокируется (423); ' +
      'частота запросов с одного IP ограничена (429).',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.login(body.login, body.password, {
      userAgent: req.header('user-agent'),
      ipAddress: req.ip,
    });
    setSessionCookies(res, session);
    return session.response;
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiHeader({ name: CSRF_HEADER, required: true, description: 'Значение cookie iot_csrf' })
  @ApiOperation({ summary: 'Новый access-токен по refresh-cookie (с ротацией refresh-токена)' })
  @ApiOkResponse({ type: SessionResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    assertCsrf(req);
    try {
      const session = await this.auth.refresh(refreshTokenOf(req));
      setSessionCookies(res, session);
      return session.response;
    } catch (error) {
      clearSessionCookies(res);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiHeader({ name: CSRF_HEADER, required: true, description: 'Значение cookie iot_csrf' })
  @ApiOperation({ summary: 'Выход: сессия завершается, cookie удаляются' })
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    assertCsrf(req);
    await this.auth.logout(refreshTokenOf(req));
    clearSessionCookies(res);
  }

  @Get('me')
  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @ApiOperation({ summary: 'Текущий пользователь, его роли и разрешения' })
  @ApiOkResponse({ type: CurrentUserDto })
  me(@User() user: AuthUser): CurrentUser {
    return {
      id: user.id,
      login: user.login,
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      roles: user.roles,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
    };
  }

  @Post('change-password')
  @HttpCode(200)
  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @ApiOperation({
    summary: 'Смена собственного пароля',
    description: 'Остальные сессии пользователя завершаются. Изменение пишется в журнал аудита.',
  })
  @ApiOkResponse({ type: CurrentUserDto })
  changePassword(@Body() body: ChangePasswordDto, @User() user: AuthUser): Promise<CurrentUser> {
    return this.auth.changePassword(user, body.currentPassword, body.newPassword);
  }
}
