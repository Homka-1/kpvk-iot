import * as shared from '@iot/shared';
import { $Enums } from '../generated/prisma/client.js';

describe('Перечисления схемы БД и пакета @iot/shared', () => {
  const prismaEnums = Object.entries($Enums) as [string, Record<string, string>][];

  it.each(prismaEnums)('%s совпадает в schema.prisma и @iot/shared', (name, values) => {
    expect((shared as Record<string, unknown>)[name]).toEqual(values);
  });
});
