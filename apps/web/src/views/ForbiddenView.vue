<script setup lang="ts">
import { useRoute } from 'vue-router';
import EmptyState from '@/components/EmptyState.vue';

/** Раздел недоступен: у пользователя нет нужного разрешения. */
const route = useRoute();
</script>

<template>
  <div class="iot-page">
    <h1>{{ route.meta.title }}</h1>
    <EmptyState
      icon="pi pi-lock"
      title="Нет доступа к разделу"
      description="Для работы с этим разделом нужны другие права. Если доступ необходим, обратитесь к администратору."
    />
  </div>
</template>
