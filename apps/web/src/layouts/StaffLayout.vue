<script setup lang="ts">
import { APP_SHORT_NAME } from '@iot/shared';
import Button from 'primevue/button';
import Drawer from 'primevue/drawer';
import Select from 'primevue/select';
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import HeaderActions from '@/components/layout/HeaderActions.vue';
import NavMenu from '@/components/layout/NavMenu.vue';
import { TEACHER_NAV, TEACHER_SERVICE_NAV, visibleNavItems } from '@/navigation';
import { useAuthStore } from '@/stores/auth';
import ForbiddenView from '@/views/ForbiddenView.vue';

/**
 * Оболочка рабочего места преподавателя (ТЗ, п. 4.1, 6.2): шапка с названием, группой,
 * дисциплиной, уведомлениями и профилем; слева постоянное меню. На узких экранах меню
 * открывается в выдвижной панели. Списки групп и дисциплин подключаются на этапах 04 и 16.
 * Пункты меню без нужного разрешения скрыты; раздел без прав показывает «Нет доступа».
 */
const auth = useAuthStore();
const route = useRoute();
const mainNav = computed(() => visibleNavItems(TEACHER_NAV, auth.hasPermission));
const serviceNav = computed(() => visibleNavItems(TEACHER_SERVICE_NAV, auth.hasPermission));
const allowed = computed(() => auth.hasPermission(route.meta.permission));
const menuOpen = ref(false);
const selectedGroup = ref<string | null>(null);
const selectedDiscipline = ref<string | null>(null);
const groups: { label: string; value: string }[] = [];
const disciplines: { label: string; value: string }[] = [];
</script>

<template>
  <div class="staff-layout">
    <a class="iot-skip-link" href="#main">Перейти к содержимому</a>
    <header class="staff-header">
      <div class="staff-header__row">
        <Button
          class="staff-header__menu-toggle"
          icon="pi pi-bars"
          text
          severity="secondary"
          aria-label="Открыть меню"
          aria-controls="staff-drawer"
          :aria-expanded="menuOpen"
          @click="menuOpen = true"
        />
        <RouterLink to="/" class="staff-header__brand">{{ APP_SHORT_NAME }}</RouterLink>
        <span class="staff-header__subtitle">Сопровождение образовательных траекторий</span>
        <HeaderActions class="staff-header__actions" />
      </div>
      <div class="staff-header__context">
        <Select
          v-model="selectedGroup"
          :options="groups"
          option-label="label"
          option-value="value"
          placeholder="Группа"
          empty-message="Нет доступных групп"
          aria-label="Учебная группа"
          class="staff-header__select"
        />
        <Select
          v-model="selectedDiscipline"
          :options="disciplines"
          option-label="label"
          option-value="value"
          placeholder="Дисциплина"
          empty-message="Нет доступных дисциплин"
          aria-label="Дисциплина"
          class="staff-header__select"
        />
      </div>
    </header>

    <div class="staff-body">
      <aside class="staff-sidebar">
        <nav aria-label="Основное меню">
          <NavMenu :items="mainNav" />
          <template v-if="serviceNav.length > 0">
            <h2 class="staff-nav-section">Служебные разделы</h2>
            <NavMenu :items="serviceNav" />
          </template>
        </nav>
      </aside>

      <main id="main" class="staff-main" tabindex="-1">
        <RouterView v-if="allowed" />
        <ForbiddenView v-else />
      </main>
    </div>

    <Drawer id="staff-drawer" v-model:visible="menuOpen" header="Меню" class="staff-drawer">
      <nav aria-label="Основное меню">
        <NavMenu :items="mainNav" @navigate="menuOpen = false" />
        <template v-if="serviceNav.length > 0">
          <h2 class="staff-nav-section">Служебные разделы</h2>
          <NavMenu :items="serviceNav" @navigate="menuOpen = false" />
        </template>
      </nav>
    </Drawer>
  </div>
</template>

<style scoped>
.staff-layout {
  min-height: 100vh;
}

.staff-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2) var(--iot-space-4);
  padding: var(--iot-space-2) var(--iot-space-4);
  background: var(--iot-color-surface);
  border-bottom: 1px solid var(--iot-color-border);
}

.staff-header__row {
  display: flex;
  align-items: center;
  gap: var(--iot-space-3);
  flex: 1 1 auto;
  min-width: 0;
  min-height: 44px;
}

.staff-header__brand {
  color: var(--iot-color-heading);
  font-size: 1.25rem;
  font-weight: 700;
  text-decoration: none;
}

.staff-header__subtitle {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.staff-header__actions {
  margin-left: auto;
}

.staff-header__context {
  display: flex;
  gap: var(--iot-space-2);
}

.staff-header__select {
  width: 220px;
}

.staff-body {
  display: grid;
  grid-template-columns: var(--iot-sidebar-width) minmax(0, 1fr);
}

.staff-sidebar {
  position: sticky;
  top: calc(var(--iot-header-height) + 1px);
  align-self: start;
  height: calc(100vh - var(--iot-header-height) - 1px);
  overflow-y: auto;
  padding: var(--iot-space-4) var(--iot-space-3);
  background: var(--iot-color-surface);
  border-right: 1px solid var(--iot-color-border);
}

.staff-nav-section {
  margin: var(--iot-space-4) var(--iot-space-3) var(--iot-space-2);
  color: var(--iot-color-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.staff-main {
  min-width: 0;
  outline: none;
}

.staff-header__menu-toggle {
  display: none;
}

@media (max-width: 1023px) {
  .staff-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .staff-sidebar {
    display: none;
  }

  .staff-header__menu-toggle {
    display: inline-flex;
  }

  .staff-header__subtitle {
    display: none;
  }

  .staff-header__context {
    flex: 1 1 100%;
    min-width: 0;
  }

  .staff-header__select {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
  }

  /* Длинная подпись сокращается многоточием, а не растягивает шапку на 360 px. */
  .staff-header__select :deep(.p-select-label) {
    min-width: 0;
  }
}
</style>
