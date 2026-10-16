<script setup lang="ts">
import { RouterLink } from 'vue-router';
import ErrorState from '@/components/ErrorState.vue';
</script>

<template>
  <main class="iot-page not-found">
    <h1>Страница не найдена</h1>
    <ErrorState
      title="Такой страницы нет"
      message="Возможно, ссылка устарела или в адресе допущена ошибка."
    >
      <RouterLink to="/">Перейти на главную</RouterLink>
    </ErrorState>
  </main>
</template>

<style scoped>
.not-found {
  margin: 0 auto;
  max-width: 720px;
}
</style>
