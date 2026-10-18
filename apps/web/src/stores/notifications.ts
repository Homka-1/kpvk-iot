import type { NotificationDto, NotificationsDto } from '@iot/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/http';

/** Период опроса новых уведомлений, мс (внутрисистемные уведомления, FR-065). */
export const NOTIFICATIONS_POLL_MS = 60_000;

/**
 * Уведомления текущего пользователя для бейджа и списка в шапке (FR-065). Список обновляется
 * опросом раз в минуту и при открытии; ошибки опроса не мешают работе — бейдж остаётся прежним.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<NotificationDto[]>([]);
  const unread = ref(0);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  function apply(data: NotificationsDto): void {
    items.value = data.items;
    unread.value = data.unread;
    error.value = null;
  }

  async function load(): Promise<void> {
    try {
      apply(await api<NotificationsDto>('/notifications'));
    } catch {
      error.value = 'Не удалось загрузить уведомления';
    }
  }

  async function markRead(item: NotificationDto): Promise<void> {
    if (item.readAt) return;
    try {
      const updated = await api<NotificationDto>(`/notifications/${item.id}/read`, {
        method: 'POST',
      });
      items.value = items.value.map((row) => (row.id === updated.id ? updated : row));
      unread.value = Math.max(0, unread.value - 1);
    } catch {
      // Отметка о прочтении не критична: переход по ссылке выполняется в любом случае.
    }
  }

  async function markAllRead(): Promise<void> {
    try {
      apply(await api<NotificationsDto>('/notifications/read-all', { method: 'POST' }));
    } catch {
      error.value = 'Не удалось отметить уведомления прочитанными';
    }
  }

  function start(): void {
    if (timer) return;
    void load();
    timer = setInterval(() => void load(), NOTIFICATIONS_POLL_MS);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { items, unread, error, load, markRead, markAllRead, start, stop };
});
