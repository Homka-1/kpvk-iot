import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** Данные текущего запроса, доступные сервисам без явной передачи (журнал аудита). */
export interface RequestContext {
  ipAddress?: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Express-middleware: открывает контекст на время обработки запроса. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ ipAddress: req.ip }, next);
}
