import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const WINDOW_MS = 60_000;

/**
 * Ограничение частоты запросов входа с одного IP-адреса: не более `LOGIN_RATE_LIMIT`
 * (по умолчанию 20) в минуту. Дополняет блокировку учётной записи после неудачных попыток:
 * мешает перебору паролей сразу по многим логинам. Счётчики хранятся в памяти процесса
 * (одна копия API в пилотной конфигурации). @nestjs/throttler не используется — см. ADR-009.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly limit = Number(process.env.LOGIN_RATE_LIMIT ?? 20);
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const now = Date.now();
    if (this.hits.size > 10_000) this.sweep(now);

    const key = req.ip ?? 'unknown';
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    entry.count += 1;
    if (entry.count <= this.limit) return true;

    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      'Слишком много попыток входа. Повторите через минуту',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
