<script setup lang="ts">
import { Permission } from '@iot/shared';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import AssignmentsPanel from './AssignmentsPanel.vue';
import DisciplinesPanel from './DisciplinesPanel.vue';
import GroupsPanel from './GroupsPanel.vue';

/**
 * Служебный раздел «Дисциплины» (п. 3.1 ТЗ): дисциплины, а для администратора — также учебные
 * группы и закрепление преподавателей (справочники п. 2.1 собраны в одном разделе, меню не меняется).
 */
const route = useRoute();
const auth = useAuthStore();
const context = useContextStore();
const tab = ref('disciplines');
const canGroups = computed(() => auth.hasPermission(Permission.GROUPS_MANAGE));
const canAssign = computed(() => auth.hasPermission(Permission.DISCIPLINES_MANAGE));

/** Списки в шапке зависят от справочников — обновляем их после изменений. */
function refreshContext(): void {
  void context.load().catch(() => undefined);
}
</script>

<template>
  <div class="iot-page">
    <h1>{{ route.meta.title }}</h1>
    <Tabs v-if="canGroups || canAssign" v-model:value="tab" scrollable>
      <TabList>
        <Tab value="disciplines">Дисциплины</Tab>
        <Tab v-if="canGroups" value="groups">Учебные группы</Tab>
        <Tab v-if="canAssign" value="assignments">Закрепление преподавателей</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="disciplines">
          <DisciplinesPanel @changed="refreshContext" />
        </TabPanel>
        <TabPanel v-if="canGroups" value="groups">
          <GroupsPanel @changed="refreshContext" />
        </TabPanel>
        <TabPanel v-if="canAssign" value="assignments">
          <AssignmentsPanel @changed="refreshContext" />
        </TabPanel>
      </TabPanels>
    </Tabs>
    <DisciplinesPanel v-else />
  </div>
</template>
