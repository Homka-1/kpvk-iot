<script setup lang="ts">
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import AssignmentsPanel from './AssignmentsPanel.vue';
import DirectionsPanel from './DirectionsPanel.vue';
import QuestionnairesPanel from './QuestionnairesPanel.vue';

/**
 * Раздел «Диагностика» (п. 4.4 ТЗ): методики, их назначение студентам и группам (UC-01)
 * и диагностические направления.
 */
const route = useRoute();
const tab = ref('questionnaires');
</script>

<template>
  <div class="iot-page">
    <h1>{{ route.meta.title }}</h1>
    <Tabs v-model:value="tab" scrollable>
      <TabList>
        <Tab value="questionnaires">Методики</Tab>
        <Tab value="assignments">Назначения</Tab>
        <Tab value="directions">Направления</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="questionnaires">
          <QuestionnairesPanel />
        </TabPanel>
        <TabPanel value="assignments">
          <AssignmentsPanel />
        </TabPanel>
        <TabPanel value="directions">
          <DirectionsPanel />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
