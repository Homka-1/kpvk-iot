import { maskPersonalData, maskString } from './mask.js';

describe('маскирование ПДн в журналах', () => {
  it('п. 8.3: скрывает e-mail, телефоны и ИИН в строках', () => {
    expect(maskString('Пишите a.ivanova@college.kz или +7 (701) 123-45-67, ИИН 990101300123')).toBe(
      'Пишите [email] или [телефон], ИИН [ИИН]',
    );
    expect(maskString('8 701 1234567')).toBe('[телефон]');
  });

  it('п. 8.3: скрывает поля с ПДн и секретами по имени ключа на любой глубине', () => {
    expect(
      maskPersonalData({
        login: 'ivanov',
        user: { lastName: 'Иванов', firstName: 'Иван', id: 'u1' },
        headers: { Authorization: 'Bearer x', Cookie: 'a=b' },
        items: [{ password: 'p', status: 401 }],
      }),
    ).toEqual({
      login: '[скрыто]',
      user: { lastName: '[скрыто]', firstName: '[скрыто]', id: 'u1' },
      headers: { Authorization: '[скрыто]', Cookie: '[скрыто]' },
      items: [{ password: '[скрыто]', status: 401 }],
    });
  });

  it('не трогает обычные значения', () => {
    expect(maskPersonalData({ status: 200, path: '/api/admin/users/123' })).toEqual({
      status: 200,
      path: '/api/admin/users/123',
    });
  });
});
