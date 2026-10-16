import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import LoginView from './LoginView.vue';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LoginView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('проверяет заполнение полей до отправки', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountWithApp(LoginView, { path: '/login', user: null });
    await wrapper.find('form').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Введите логин');
      expect(wrapper.text()).toContain('Введите пароль');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('NFR-005: показывает сообщение сервера при неверном пароле', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { statusCode: 401, message: 'Неверный логин или пароль' }),
        ),
    );
    const { wrapper } = await mountWithApp(LoginView, { path: '/login', user: null });
    await wrapper.find('#login-name').setValue('teacher');
    await wrapper.find('#login-password').setValue('wrong-password');
    await wrapper.find('form').trigger('submit');
    await vi.waitFor(() =>
      expect(wrapper.find('[role="alert"]').text()).toBe('Неверный логин или пароль'),
    );
  });

  it('после входа открывает главную пользователя', async () => {
    const user = testUser(['student']);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: 't', expiresIn: 900, user })),
    );
    const { wrapper, router } = await mountWithApp(LoginView, { path: '/login', user: null });
    await wrapper.find('#login-name').setValue('student');
    await wrapper.find('#login-password').setValue('password-1');
    await wrapper.find('form').trigger('submit');
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/student'));
  });
});
