<script setup lang="ts">
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import GradesPanel from '@/views/grades/GradesPanel.vue';
import ControlWorksPanel from './ControlWorksPanel.vue';

/**
 * Раздел «Академические достижения» (этап 28): контрольные работы — входной, текущий и итоговый
 * контроль с одинаковыми заданиями для групп — и оценки за семестр (этап 26, перенесены сюда из
 * раздела «Дисциплины»). Индивидуальная динамика — в профиле студента.
 */
const route = useRoute();
const tab = ref(route.query.tab === 'grades' ? 'grades' : 'works');
</script>

<template>
  <div class="iot-page">
    <h1>{{ route.meta.title }}</h1>
    <Tabs v-model:value="tab" scrollable>
      <TabList>
        <Tab value="works">Контрольные работы</Tab>
        <Tab value="grades">Оценки за семестр</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="works">
          <ControlWorksPanel />
        </TabPanel>
        <TabPanel value="grades">
          <GradesPanel />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
