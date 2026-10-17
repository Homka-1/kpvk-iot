<script setup lang="ts">
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import DirectionsPanel from './DirectionsPanel.vue';
import QuestionnairesPanel from './QuestionnairesPanel.vue';

/**
 * Раздел «Диагностика» (п. 4.4 ТЗ): методики и диагностические направления.
 * Назначение и проведение диагностики добавляются на этапе 07.
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
        <Tab value="directions">Направления</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="questionnaires">
          <QuestionnairesPanel />
        </TabPanel>
        <TabPanel value="directions">
          <DirectionsPanel />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
