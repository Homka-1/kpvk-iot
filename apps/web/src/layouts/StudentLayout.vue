<script setup lang="ts">
import { APP_SHORT_NAME } from '@iot/shared';
import Drawer from 'primevue/drawer';
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import HeaderActions from '@/components/layout/HeaderActions.vue';
import NavMenu from '@/components/layout/NavMenu.vue';
import { isNavItemActive, STUDENT_BOTTOM_NAV_SIZE, STUDENT_NAV } from '@/navigation';

/**
 * Оболочка кабинета студента (ТЗ, п. 3.2, 6.5). На смартфоне — нижняя панель с основными
 * пунктами и кнопка «Ещё», открывающая полное меню; на широком экране — боковое меню.
 */
const route = useRoute();
const menuOpen = ref(false);
const bottomItems = STUDENT_NAV.slice(0, STUDENT_BOTTOM_NAV_SIZE);
const moreActive = computed(() =>
  STUDENT_NAV.slice(STUDENT_BOTTOM_NAV_SIZE).some((item) => isNavItemActive(item, route.path)),
);
</script>

<template>
  <div class="student-layout">
    <a class="iot-skip-link" href="#main">Перейти к содержимому</a>
    <header class="student-header">
      <RouterLink to="/student" class="student-header__brand">{{ APP_SHORT_NAME }}</RouterLink>
      <span class="student-header__subtitle">Личный кабинет студента</span>
      <HeaderActions class="student-header__actions" />
    </header>

    <div class="student-body">
      <aside class="student-sidebar">
        <nav aria-label="Меню студента">
          <NavMenu :items="STUDENT_NAV" />
        </nav>
      </aside>

      <main id="main" class="student-main" tabindex="-1">
        <RouterView />
      </main>
    </div>

    <nav class="student-bottom-nav" aria-label="Быстрая навигация">
      <RouterLink
        v-for="item in bottomItems"
        :key="item.name"
        :to="item.path"
        class="student-bottom-nav__item"
        :class="{ 'student-bottom-nav__item--active': isNavItemActive(item, route.path) }"
        :aria-current="isNavItemActive(item, route.path) ? 'page' : undefined"
      >
        <i :class="item.icon" aria-hidden="true" />
        <span>{{ item.shortLabel ?? item.label }}</span>
      </RouterLink>
      <button
        type="button"
        class="student-bottom-nav__item"
        :class="{ 'student-bottom-nav__item--active': moreActive }"
        aria-controls="student-drawer"
        :aria-expanded="menuOpen"
        @click="menuOpen = true"
      >
        <i class="pi pi-ellipsis-h" aria-hidden="true" />
        <span>Ещё</span>
      </button>
    </nav>

    <Drawer
      id="student-drawer"
      v-model:visible="menuOpen"
      header="Меню"
      position="bottom"
      class="student-drawer"
    >
      <nav aria-label="Меню студента">
        <NavMenu :items="STUDENT_NAV" @navigate="menuOpen = false" />
      </nav>
    </Drawer>
  </div>
</template>

<style scoped>
.student-layout {
  min-height: 100vh;
}

.student-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--iot-space-3);
  min-height: var(--iot-header-height);
  padding: var(--iot-space-2) var(--iot-space-4);
  background: var(--iot-color-surface);
  border-bottom: 1px solid var(--iot-color-border);
}

.student-header__brand {
  color: var(--iot-color-heading);
  font-size: 1.25rem;
  font-weight: 700;
  text-decoration: none;
}

.student-header__subtitle {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.student-header__actions {
  margin-left: auto;
}

.student-body {
  display: grid;
  grid-template-columns: var(--iot-sidebar-width) minmax(0, 1fr);
}

.student-sidebar {
  position: sticky;
  top: var(--iot-header-height);
  align-self: start;
  height: calc(100vh - var(--iot-header-height));
  overflow-y: auto;
  padding: var(--iot-space-4) var(--iot-space-3);
  background: var(--iot-color-surface);
  border-right: 1px solid var(--iot-color-border);
}

.student-main {
  min-width: 0;
  outline: none;
}

.student-bottom-nav {
  display: none;
}

@media (max-width: 1023px) {
  .student-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .student-sidebar {
    display: none;
  }

  .student-main {
    padding-bottom: var(--iot-bottom-nav-height);
  }

  .student-bottom-nav {
    position: fixed;
    inset: auto 0 0;
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    height: var(--iot-bottom-nav-height);
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--iot-color-surface);
    border-top: 1px solid var(--iot-color-border);
  }

  .student-bottom-nav__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    padding: var(--iot-space-1) 1px;
    border: 0;
    background: none;
    color: var(--iot-color-muted);
    font: inherit;
    font-size: 0.625rem;
    letter-spacing: -0.01em;
    text-decoration: none;
    cursor: pointer;
  }

  .student-bottom-nav__item span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .student-bottom-nav__item i {
    font-size: 1.25rem;
  }

  .student-bottom-nav__item--active {
    color: var(--iot-navy-700);
    font-weight: 700;
    box-shadow: inset 0 3px 0 var(--iot-navy-700);
  }
}

@media (max-width: 599px) {
  .student-header__subtitle {
    display: none;
  }
}
</style>
