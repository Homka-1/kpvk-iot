<script setup lang="ts">
import type { CabinetDiagnosticDto } from '@iot/shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import { periodText, sessionBadge } from '@/views/diagnostics/sessions';

/**
 * «Диагностика» в кабинете студента (п. 3.2 ТЗ; UC-01): назначенные методики и пройденные
 * с понятной студенту интерпретацией (FR-016). Баллы и служебные уровни студенту не передаются.
 */
const route = useRoute();
const items = ref<CabinetDiagnosticDto[] | null>(null);
const error = ref<string | null>(null);

const open = computed(
  () =>
    items.value?.filter((item) => item.status === 'ASSIGNED' || item.status === 'IN_PROGRESS') ??
    [],
);
const done = computed(() => items.value?.filter((item) => item.status === 'COMPLETED') ?? []);
const expired = computed(() => items.value?.filter((item) => item.status === 'EXPIRED') ?? []);

async function load(): Promise<void> {
  error.value = null;
  try {
    items.value = await api<CabinetDiagnosticDto[]>('/cabinet/diagnostics');
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить диагностику';
  }
}

onMounted(load);
</script>

<template>
  <div class="iot-page my-diagnostics">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!items" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="items.length === 0"
      icon="pi pi-list-check"
      title="Диагностик пока нет"
      description="Когда преподаватель назначит методику, она появится здесь."
    />
    <template v-else>
      <section aria-labelledby="my-diagnostics-open">
        <h2 id="my-diagnostics-open" class="my-diagnostics__title">Нужно пройти</h2>
        <p v-if="open.length === 0" class="my-diagnostics__muted">
          Сейчас назначенных методик нет.
        </p>
        <ul v-else class="my-diagnostics__list">
          <li v-for="item in open" :key="item.id">
            <RouterLink
              :to="{ name: 'student-diagnostic-run', params: { id: item.id } }"
              class="iot-card my-diagnostics__card"
            >
              <span class="my-diagnostics__name">{{ item.title }}</span>
              <StatusBadge v-bind="sessionBadge(item.status)" />
              <span class="my-diagnostics__muted">
                Срок: {{ periodText(item.startsAt, item.endsAt) }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="done.length" aria-labelledby="my-diagnostics-done">
        <h2 id="my-diagnostics-done" class="my-diagnostics__title">Пройдено</h2>
        <ul class="my-diagnostics__list">
          <li v-for="item in done" :key="item.id" class="iot-card my-diagnostics__card">
            <span class="my-diagnostics__name">{{ item.title }}</span>
            <StatusBadge v-bind="sessionBadge(item.status)" />
            <span class="my-diagnostics__muted">{{ formatDateTime(item.completedAt) }}</span>
            <ul v-if="item.results.length" class="my-diagnostics__results">
              <li v-for="result in item.results" :key="result.scale">
                <strong>{{ result.scale }}.</strong> {{ result.text }}
              </li>
            </ul>
            <span v-else class="my-diagnostics__muted">
              Результаты обсудит с вами преподаватель.
            </span>
          </li>
        </ul>
      </section>

      <section v-if="expired.length" aria-labelledby="my-diagnostics-expired">
        <h2 id="my-diagnostics-expired" class="my-diagnostics__title">Срок истёк</h2>
        <ul class="my-diagnostics__list">
          <li v-for="item in expired" :key="item.id" class="iot-card my-diagnostics__card">
            <span class="my-diagnostics__name">{{ item.title }}</span>
            <StatusBadge v-bind="sessionBadge(item.status)" />
            <span class="my-diagnostics__muted">
              Если вы не успели, обратитесь к преподавателю.
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.my-diagnostics {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.my-diagnostics h1 {
  margin: 0;
}

.my-diagnostics__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.0625rem;
}

.my-diagnostics__list,
.my-diagnostics__results {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-diagnostics__card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-1);
  color: inherit;
  text-decoration: none;
}

a.my-diagnostics__card:hover .my-diagnostics__name,
a.my-diagnostics__card:focus-visible .my-diagnostics__name {
  text-decoration: underline;
}

.my-diagnostics__name {
  color: var(--iot-color-heading);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.my-diagnostics__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.my-diagnostics__results {
  margin-top: var(--iot-space-1);
}
</style>
