<script setup lang="ts">
import { useRoute } from 'vue-router';
import EmptyState from '@/components/EmptyState.vue';

/** Заглушка раздела, функции которого появятся на следующих этапах разработки. */
const route = useRoute();
</script>

<template>
  <div class="iot-page">
    <h1>{{ route.meta.title }}</h1>
    <EmptyState
      icon="pi pi-wrench"
      title="Раздел в разработке"
      description="Функции этого раздела появятся в следующих версиях приложения."
    />
  </div>
</template>
