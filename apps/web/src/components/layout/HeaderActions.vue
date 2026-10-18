<script setup lang="ts">
import { type NotificationDto, ROLE_LABELS } from '@iot/shared';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import type { MenuItem } from 'primevue/menuitem';
import Popover from 'primevue/popover';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useNotificationsStore } from '@/stores/notifications';
import { formatDateTime } from '@/utils/format';

/**
 * Уведомления и профиль пользователя в шапке: счётчик непрочитанных и список уведомлений
 * (FR-065), ФИО, роль, смена пароля и выход.
 */
const auth = useAuthStore();
const notifications = useNotificationsStore();
const router = useRouter();
const menu = ref<InstanceType<typeof Menu>>();
const panel = ref<InstanceType<typeof Popover>>();

const badge = computed(() => (notifications.unread > 99 ? '99+' : String(notifications.unread)));
const bellLabel = computed(() =>
  notifications.unread > 0 ? `Уведомления: непрочитанных ${notifications.unread}` : 'Уведомления',
);

onMounted(() => notifications.start());
onBeforeUnmount(() => notifications.stop());

function togglePanel(event: Event): void {
  panel.value?.toggle(event);
  void notifications.load();
}

async function open(item: NotificationDto): Promise<void> {
  await notifications.markRead(item);
  panel.value?.hide();
  if (item.link) await router.push(item.link);
}

const roleLabel = computed(
  () => auth.user?.roles.map((role) => ROLE_LABELS[role]).join(', ') ?? '',
);

const items: MenuItem[] = [
  {
    label: 'Сменить пароль',
    icon: 'pi pi-key',
    command: () => router.push({ name: 'change-password' }),
  },
  {
    label: 'Выйти',
    icon: 'pi pi-sign-out',
    command: async () => {
      await auth.logout().catch(() => undefined);
      await router.push({ name: 'login' });
    },
  },
];
</script>

<template>
  <div class="header-actions">
    <button
      type="button"
      class="header-actions__bell"
      :aria-label="bellLabel"
      title="Уведомления"
      aria-haspopup="dialog"
      aria-controls="notifications-panel"
      @click="togglePanel"
    >
      <i class="pi pi-bell" aria-hidden="true" />
      <span v-if="notifications.unread > 0" class="header-actions__badge" aria-hidden="true">
        {{ badge }}
      </span>
    </button>
    <Popover id="notifications-panel" ref="panel" class="header-actions__panel">
      <section class="notifications" aria-labelledby="notifications-title">
        <div class="notifications__head">
          <h2 id="notifications-title" class="notifications__title">Уведомления</h2>
          <Button
            v-if="notifications.unread > 0"
            label="Прочитать все"
            size="small"
            text
            @click="notifications.markAllRead()"
          />
        </div>
        <p v-if="notifications.error" class="notifications__error" role="alert">
          {{ notifications.error }}
        </p>
        <p v-else-if="notifications.items.length === 0" class="notifications__empty">
          Новых уведомлений нет.
        </p>
        <ul v-else class="notifications__list">
          <li v-for="item in notifications.items" :key="item.id">
            <button
              type="button"
              class="notifications__item"
              :class="{ 'notifications__item--unread': !item.readAt }"
              @click="open(item)"
            >
              <span class="notifications__state">
                <i :class="item.readAt ? 'pi pi-check' : 'pi pi-circle-fill'" aria-hidden="true" />
                {{ item.readAt ? 'Прочитано' : 'Новое' }}
              </span>
              <strong>{{ item.title }}</strong>
              <span v-if="item.body">{{ item.body }}</span>
              <span class="notifications__time">{{ formatDateTime(item.createdAt) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </Popover>
    <button
      type="button"
      class="header-actions__user"
      aria-haspopup="menu"
      aria-controls="user-menu"
      :aria-label="`Профиль: ${auth.fullName}`"
      @click="menu?.toggle($event)"
    >
      <i class="pi pi-user" aria-hidden="true" />
      <span class="header-actions__user-text">
        <span class="header-actions__name">{{ auth.fullName }}</span>
        <span class="header-actions__role">{{ roleLabel }}</span>
      </span>
      <i class="pi pi-angle-down header-actions__caret" aria-hidden="true" />
    </button>
    <Menu id="user-menu" ref="menu" :model="items" popup />
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.header-actions__bell {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--iot-color-muted);
  font-size: 1.125rem;
  cursor: pointer;
}

.header-actions__bell:hover {
  background: var(--iot-navy-50);
  color: var(--iot-navy-800);
}

.header-actions__badge {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--iot-tone-danger-text);
  color: var(--iot-color-on-primary);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.notifications {
  width: min(22rem, calc(100vw - 2 * var(--iot-space-4)));
}

.notifications__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
  margin-bottom: var(--iot-space-2);
}

.notifications__title {
  margin: 0;
  color: var(--iot-color-heading);
  font-size: 1rem;
}

.notifications__empty,
.notifications__error {
  margin: 0;
  color: var(--iot-color-muted);
}

.notifications__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  max-height: min(24rem, 60vh);
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.notifications__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--iot-space-2);
  border: 1px solid transparent;
  border-radius: var(--iot-radius);
  background: none;
  color: var(--iot-color-text);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}

.notifications__item:hover {
  background: var(--iot-navy-50);
}

.notifications__item--unread {
  border-color: var(--iot-color-info-border);
  background: var(--iot-color-info-bg);
}

.notifications__state {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-1);
  color: var(--iot-color-muted);
  font-size: 0.75rem;
}

.notifications__item--unread .notifications__state {
  color: var(--iot-color-info-text);
  font-weight: 600;
}

.notifications__state .pi {
  font-size: 0.5rem;
}

.notifications__time {
  color: var(--iot-color-muted);
  font-size: 0.75rem;
}

.header-actions__user {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-2);
  min-height: 40px;
  padding: 0 var(--iot-space-2);
  border: 0;
  border-radius: var(--iot-radius);
  background: none;
  color: var(--iot-color-text);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}

.header-actions__user > .pi-user {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--iot-navy-100);
  color: var(--iot-navy-800);
}

.header-actions__user:hover {
  background: var(--iot-navy-50);
}

.header-actions__user-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.header-actions__name {
  font-weight: 600;
}

.header-actions__role {
  color: var(--iot-color-muted);
  font-size: 0.75rem;
}

.header-actions__caret {
  color: var(--iot-color-muted);
  font-size: 0.75rem;
}

@media (max-width: 767px) {
  .header-actions__user-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
