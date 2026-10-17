<script setup lang="ts">
import {
  MOTIVATION_LEVELS,
  type MotivationStrategiesDto,
  type ProfileDistributionDto,
  type ProfileFilterValue,
} from '@iot/shared';
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import MetricCard from '@/components/MetricCard.vue';
import { useContextStore } from '@/stores/context';
import { PROFILE_FILTER_LABELS } from '@/views/students/labels';
import StrategyCard from './StrategyCard.vue';

/**
 * Раздел «Мотивационные профили» (п. 4.5): три карточки профилей со стратегиями сопровождения
 * (FR-030) и распределение текущих профилей студентов доступных групп. Каждый показатель ведёт
 * к списку студентов с этим профилем; профиль формируется и утверждается в карточке студента.
 */
const route = useRoute();
const context = useContextStore();
const distribution = ref<ProfileDistributionDto | null>(null);
const strategies = ref<MotivationStrategiesDto | null>(null);
const error = ref<string | null>(null);

const STATUS_FILTERS: {
  value: Exclude<ProfileFilterValue, 'HIGH' | 'MEDIUM' | 'LOW'>;
  icon: string;
}[] = [
  { value: 'PROPOSED', icon: 'pi pi-hourglass' },
  { value: 'NEEDS_MORE_DIAGNOSTICS', icon: 'pi pi-exclamation-triangle' },
];

const listLink = (profile: ProfileFilterValue) => ({ path: '/students', query: { profile } });

async function load(): Promise<void> {
  error.value = null;
  try {
    const [counts, texts] = await Promise.all([
      api<ProfileDistributionDto>('/motivation-profiles/distribution', {
        query: { groupId: context.groupId, disciplineId: context.disciplineId },
      }),
      strategies.value
        ? Promise.resolve(strategies.value)
        : api<MotivationStrategiesDto>('/motivation-strategies'),
    ]);
    strategies.value = texts;
    distribution.value = counts;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить профили';
  }
}

watch(() => [context.groupId, context.disciplineId], load, { immediate: true });
</script>

<template>
  <div class="iot-page profiles">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!distribution || !strategies" role="status">Загрузка…</p>
    <template v-else>
      <p class="profiles__muted">
        Профиль предлагает система по результатам диагностики, утверждает преподаватель в карточке
        студента (вкладка «Мотивационный профиль»). Профиль помогает выбрать поддержку и не
        ограничивает сложность заданий.
        <template v-if="context.group || context.discipline">
          Показаны студенты:
          {{ [context.group?.name, context.discipline?.name].filter(Boolean).join(', ') }}.
        </template>
      </p>

      <EmptyState
        v-if="distribution.total === 0"
        icon="pi pi-users"
        title="Студентов нет"
        description="В выбранных группах и дисциплинах нет действующих студентов."
      />

      <section aria-labelledby="profiles-levels">
        <h2 id="profiles-levels" class="profiles__title">Профили и стратегии сопровождения</h2>
        <div class="profiles__grid">
          <StrategyCard
            v-for="level in MOTIVATION_LEVELS"
            :key="level"
            :level="level"
            :items="strategies[level]"
          >
            <RouterLink class="profiles__count" :to="listLink(level)">
              Студентов с профилем: {{ distribution[level] }}
              <i class="pi pi-arrow-right" aria-hidden="true" />
            </RouterLink>
          </StrategyCard>
        </div>
      </section>

      <section aria-labelledby="profiles-pending">
        <h2 id="profiles-pending" class="profiles__title">Требуют внимания</h2>
        <div class="profiles__metrics">
          <MetricCard
            v-for="item in STATUS_FILTERS"
            :key="item.value"
            :label="PROFILE_FILTER_LABELS[item.value]"
            :value="distribution[item.value]"
            :icon="item.icon"
            :to="listLink(item.value)"
          />
          <MetricCard
            label="Профиль не формировался"
            :value="distribution.NONE"
            icon="pi pi-minus-circle"
            :hint="`Всего студентов: ${distribution.total}`"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.profiles {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.profiles h1 {
  margin: 0;
}

.profiles__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.profiles__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.0625rem;
}

.profiles__grid,
.profiles__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: var(--iot-space-3);
}

.profiles__count {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-1);
  margin-top: auto;
  font-weight: 600;
}
</style>
