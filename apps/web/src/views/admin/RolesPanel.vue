<script setup lang="ts">
import { computed } from 'vue';
import StatusBadge from '@/components/StatusBadge.vue';
import type { PermissionInfo, RoleInfo } from './types';

/**
 * Системные роли и их разрешения (только просмотр). Наборы прав заданы в коде и одинаковы
 * для всех установок; дополнительные права выдаются пользователю индивидуально.
 */
const props = defineProps<{ roles: RoleInfo[]; permissions: PermissionInfo[] }>();

const byCode = computed(() => new Map(props.permissions.map((item) => [item.code, item])));
</script>

<template>
  <div class="roles-panel">
    <p class="roles-panel__intro">
      Наборы разрешений ролей фиксированы. Доступ к диагностическим ответам и к персональным данным
      участников исследования выдаётся только индивидуально, с основанием, в карточке пользователя.
    </p>
    <article v-for="role in roles" :key="role.code" class="roles-panel__role iot-card">
      <h3>{{ role.name }}</h3>
      <p class="roles-panel__muted">{{ role.description }}</p>
      <ul class="roles-panel__list">
        <li v-for="code in role.permissions" :key="code">
          <i class="pi pi-check" aria-hidden="true" />
          <span>{{ byCode.get(code)?.description ?? code }}</span>
          <StatusBadge
            v-if="byCode.get(code)?.sensitive"
            label="Конфиденциально"
            tone="warning"
            icon="pi pi-lock"
          />
        </li>
      </ul>
    </article>
  </div>
</template>

<style scoped>
.roles-panel {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: var(--iot-space-4);
}

.roles-panel__intro {
  grid-column: 1 / -1;
  margin: 0;
  padding: var(--iot-space-3) var(--iot-space-4);
  border: 1px solid var(--iot-color-info-border);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
  color: var(--iot-color-info-text);
}

.roles-panel__role {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding: var(--iot-space-4);
}

.roles-panel__role h3 {
  margin: 0;
  font-size: 1.0625rem;
}

.roles-panel__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.roles-panel__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.roles-panel__list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.roles-panel__list .pi-check {
  color: var(--iot-tone-success-text);
}
</style>
