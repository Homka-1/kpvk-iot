import { Prisma } from '../generated/prisma/client.js';
import { errorForLog } from './mask.js';

describe('errorForLog', () => {
  it('п. 8.3: из ошибки Prisma в журнал не попадают аргументы запроса с ПДн', () => {
    const error = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.student.create()` invocation:\n{ data: { lastName: "Персональнова", login: "ivanov" } }',
      { clientVersion: 'test' },
    );
    const logged = errorForLog(error);
    expect(logged.message).toBe('PrismaClientValidationError: текст запроса скрыт');
    expect(JSON.stringify(logged)).not.toContain('Персональнова');
    expect(JSON.stringify(logged)).not.toContain('ivanov');
    expect(logged.stack).toContain('at ');
  });

  it('п. 8.3: код известной ошибки Prisma сохраняется для разбора', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint: "Иванов"', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(errorForLog(error).message).toBe(
      'PrismaClientKnownRequestError P2002: текст запроса скрыт',
    );
  });

  it('прочие ошибки журналируются как есть (маскирование — в логгере)', () => {
    const error = new TypeError('cannot read x');
    expect(errorForLog(error)).toEqual({ message: 'cannot read x', stack: error.stack });
    expect(errorForLog('строка')).toEqual({ message: 'Необработанная ошибка' });
  });
});
