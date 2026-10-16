<script setup lang="ts">
import { Permission } from '@iot/shared';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import { useAuthStore } from '@/stores/auth';
import AuditPanel from './AuditPanel.vue';
import RolesPanel from './RolesPanel.vue';
import type { PermissionInfo, RoleInfo } from './types';
import UsersPanel from './UsersPanel.vue';

/** Раздел «Администрирование»: учётные записи, роли и разрешения, журнал аудита. */
const route = useRoute();
const auth = useAuthStore();
const tab = ref('users');
const roles = ref<RoleInfo[]>([]);
const permissions = ref<PermissionInfo[]>([]);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    [roles.value, permissions.value] = await Promise.all([
      api<RoleInfo[]>('/admin/roles'),
      api<PermissionInfo[]>('/admin/permissions'),
    ]);
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить данные';
  }
}

onMounted(load);
</script>

<template>
  <div class="iot-page">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <Tabs v-else v-model:value="tab">
      <TabList>
        <Tab value="users">Пользователи</Tab>
        <Tab value="roles">Роли и разрешения</Tab>
        <Tab v-if="auth.hasPermission(Permission.AUDIT_READ)" value="audit">Журнал аудита</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="users">
          <UsersPanel :permissions="permissions" />
        </TabPanel>
        <TabPanel value="roles">
          <RolesPanel :roles="roles" :permissions="permissions" />
        </TabPanel>
        <TabPanel v-if="auth.hasPermission(Permission.AUDIT_READ)" value="audit">
          <AuditPanel />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
