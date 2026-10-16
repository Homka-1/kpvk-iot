import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessScopeService } from './access-scope.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimitGuard } from './login-rate-limit.guard.js';
import { RbacCatalogSync } from './rbac-catalog.js';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Переменная окружения JWT_SECRET должна содержать не менее 32 символов');
  }
  return secret;
}

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessScopeService,
    RbacCatalogSync,
    LoginRateLimitGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AccessScopeService],
})
export class AuthModule {}
