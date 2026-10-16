import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX, APP_NAME, REFRESH_COOKIE } from '@iot/shared';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter, validationException } from './common/http-exception.filter.js';
import { requestContextMiddleware } from './common/request-context.js';
import { AppLogger } from './logging/app-logger.js';
import { createRequestLoggingMiddleware } from './logging/request-logging.middleware.js';

/**
 * Общая настройка приложения: используется и в `main.ts`, и в e2e-тестах,
 * чтобы тесты проверяли ту же конфигурацию, что работает в production.
 */
export function configureApp(app: INestApplication, logger = new AppLogger()): void {
  app.useLogger(logger);
  app.use(requestContextMiddleware);
  app.use(createRequestLoggingMiddleware(logger));
  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationException,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  const config = new DocumentBuilder()
    .setTitle(APP_NAME)
    .setDescription(
      'REST API веб-приложения сопровождения ИОТ студентов колледжа. ' +
        'Авторизация: access-токен из POST /api/auth/login в заголовке Authorization: Bearer.',
    )
    .setVersion('0.0.0')
    .addBearerAuth()
    .addCookieAuth(REFRESH_COOKIE)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    jsonDocumentUrl: `${API_PREFIX}/docs/openapi.json`,
  });
}
