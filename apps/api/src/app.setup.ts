import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX, APP_NAME, REFRESH_COOKIE } from '@iot/shared';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter, validationException } from './common/http-exception.filter.js';
import { requestContextMiddleware } from './common/request-context.js';
import { AppLogger } from './logging/app-logger.js';
import { createRequestLoggingMiddleware } from './logging/request-logging.middleware.js';

/** Предел JSON-тела запроса: с запасом для крупной методики (FR-017), но не для перегрузки API. */
export const JSON_BODY_LIMIT = '2mb';

/**
 * Заголовки безопасности (п. 8.3). API отдаёт только JSON, файлы и страницу документации,
 * поэтому политика строгая: свои скрипты, без фреймов и плагинов. Встроенные стили нужны
 * странице документации (swagger-ui).
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
});

/**
 * Общая настройка приложения: используется и в `main.ts`, и в e2e-тестах,
 * чтобы тесты проверяли ту же конфигурацию, что работает в production.
 */
export function configureApp(app: NestExpressApplication, logger = new AppLogger()): void {
  app.useLogger(logger);
  // За обратным прокси (nginx) адрес клиента берётся из X-Forwarded-For, иначе ограничение
  // попыток входа и журнал аудита видели бы один адрес прокси. Число доверенных прокси задаётся
  // явно: без прокси заголовок присылает сам клиент, и доверять ему нельзя.
  const trustedProxies = Number(process.env.TRUST_PROXY ?? 0);
  if (trustedProxies > 0) app.set('trust proxy', trustedProxies);
  app.use(securityHeaders);
  // Ответы API содержат персональные данные: не сохранять их в кэше браузера и прокси.
  app.use(
    (_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
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
