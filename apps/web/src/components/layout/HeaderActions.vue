<script setup lang="ts">
import { ROLE_LABELS } from '@iot/shared';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import type { MenuItem } from 'primevue/menuitem';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

/**
 * Уведомления и профиль пользователя в шапке: ФИО, роль, смена пароля и выход.
 * Счётчик уведомлений появится на этапе 15.
 */
const auth = useAuthStore();
const router = useRouter();
const menu = ref<InstanceType<typeof Menu>>();

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
    <Button
      icon="pi pi-bell"
      text
      rounded
      severity="secondary"
      aria-label="Уведомления"
      title="Уведомления"
    />
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
