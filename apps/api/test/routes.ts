import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import type { Permission } from '@iot/shared';
import {
  IS_PUBLIC,
  REQUIRED_ANY_PERMISSIONS,
  REQUIRED_PERMISSIONS,
} from '../src/auth/decorators.js';

export interface RouteInfo {
  /** `GET /api/students/:id` */
  key: string;
  method: string;
  path: string;
  isPublic: boolean;
  permissions: Permission[];
  anyPermissions: Permission[];
}

/** Все маршруты приложения с метаданными доступа (как их видит глобальный AuthGuard). */
export function collectRoutes(app: INestApplication): RouteInfo[] {
  const scanner = new MetadataScanner();
  const reflector = app.get(Reflector);
  const routes: RouteInfo[] = [];
  const wrappers = [...app.get(ModulesContainer).values()].flatMap((module) => [
    ...module.controllers.values(),
  ]);
  for (const wrapper of wrappers) {
    const controller = wrapper.metatype as (new (...args: never[]) => object) | undefined;
    if (!controller) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    for (const name of scanner.getAllMethodNames(controller.prototype)) {
      const handler = (controller.prototype as Record<string, unknown>)[name] as object;
      const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (sub === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number]!;
      const path = '/' + ['api', base, sub].filter((part) => part && part !== '/').join('/');
      const targets = [handler as () => void, controller];
      routes.push({
        key: `${method} ${path}`,
        method,
        path,
        isPublic: reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ?? false,
        permissions: reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, targets) ?? [],
        anyPermissions:
          reflector.getAllAndOverride<Permission[]>(REQUIRED_ANY_PERMISSIONS, targets) ?? [],
      });
    }
  }
  return routes.sort((a, b) => a.key.localeCompare(b.key));
}
