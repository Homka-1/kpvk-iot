<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import { isNavItemActive, type NavItem } from '@/navigation';

defineProps<{ items: readonly NavItem[] }>();
defineEmits<{ navigate: [] }>();

const route = useRoute();
</script>

<template>
  <ul class="nav-menu">
    <li v-for="item in items" :key="item.name">
      <RouterLink
        :to="item.path"
        class="nav-menu__link"
        :class="{ 'nav-menu__link--active': isNavItemActive(item, route.path) }"
        :aria-current="isNavItemActive(item, route.path) ? 'page' : undefined"
        @click="$emit('navigate')"
      >
        <i :class="item.icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.nav-menu {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-menu__link {
  display: flex;
  align-items: center;
  gap: var(--iot-space-3);
  min-height: 44px;
  padding: var(--iot-space-2) var(--iot-space-3);
  border-radius: var(--iot-radius);
  color: var(--iot-color-text);
  text-decoration: none;
}

.nav-menu__link i {
  width: 1.25rem;
  color: var(--iot-navy-700);
  text-align: center;
}

.nav-menu__link:hover {
  background: var(--iot-navy-50);
}

.nav-menu__link--active {
  background: var(--iot-navy-700);
  color: var(--iot-color-on-primary);
  font-weight: 600;
}

.nav-menu__link--active i {
  color: var(--iot-color-on-primary);
}

.nav-menu__link--active:hover {
  background: var(--iot-navy-800);
}
</style>
