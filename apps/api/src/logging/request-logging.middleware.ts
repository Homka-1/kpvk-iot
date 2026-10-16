import type { NextFunction, Request, Response } from 'express';
import { getRequestContext } from '../common/request-context.js';
import type { AppLogger } from './app-logger.js';

/**
 * Журнал HTTP-запросов: метод, шаблон маршрута (без query-параметров — в них могут быть ПДн,
 * п. 8.3 ТЗ), статус, длительность и идентификатор пользователя.
 */
export function createRequestLoggingMiddleware(logger: AppLogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    const context = getRequestContext();
    res.on('finish', () => {
      const route = (req.route as { path?: string } | undefined)?.path;
      const path = route ? `${req.baseUrl}${route}` : req.path;
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger.write(level, {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        userId: context?.userId,
      });
    });
    next();
  };
}
