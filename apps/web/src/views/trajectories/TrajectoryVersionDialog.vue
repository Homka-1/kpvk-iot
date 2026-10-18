<script setup lang="ts">
import { trajectoryDiff, type TrajectoryDto, type TrajectoryVersionDto } from '@iot/shared';
import Dialog from 'primevue/dialog';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import { formatDateTime } from '@/utils/format';
import StageMap from './StageMap.vue';
import TrajectoryPassport from './TrajectoryPassport.vue';
import VersionChanges from './VersionChanges.vue';

/**
 * Просмотр зафиксированной версии ИОТ (FR-043, UC-05): причина, автор, изменения относительно
 * предыдущей версии и неизменяемый снимок маршрута.
 */
const props = defineProps<{ trajectoryId: string; versionNumber: number | null }>();
const visible = defineModel<boolean>('visible', { required: true });

const version = ref<TrajectoryVersionDto | null>(null);
const previous = ref<TrajectoryVersionDto | null>(null);
const error = ref<string | null>(null);

async function load(number: number): Promise<void> {
  version.value = null;
  previous.value = null;
  error.value = null;
  const get = (n: number) =>
    api<TrajectoryVersionDto>(`/trajectories/${props.trajectoryId}/versions/${n}`);
  try {
    const [current, before] = await Promise.all([
      get(number),
      number > 1 ? get(number - 1) : Promise.resolve(null),
    ]);
    version.value = current;
    previous.value = before;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить версию';
  }
}

watch(
  () => [visible.value, props.versionNumber] as const,
  ([open, number]) => {
    if (open && number) void load(number);
  },
  { immediate: true },
);

const changes = computed(() =>
  version.value && previous.value
    ? trajectoryDiff(previous.value.snapshot, version.value.snapshot)
    : [],
);
/** Снимок в форме паспорта: списки версий и предложений в снимок не входят. */
const asTrajectory = computed<TrajectoryDto | null>(() =>
  version.value ? { ...version.value.snapshot, versions: [], proposals: [] } : null,
);
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="versionNumber ? `Версия ${versionNumber}` : 'Версия'"
    :style="{ width: '64rem' }"
    :breakpoints="{ '991px': '95vw' }"
  >
    <ErrorState v-if="error" :message="error" />
    <p v-else-if="!version || !asTrajectory" role="status">Загрузка…</p>
    <div v-else class="version">
      <p class="version__meta">
        {{ formatDateTime(version.createdAt) }} · {{ version.createdBy?.fullName ?? 'Нет данных' }}
        <template v-if="version.reason"> · причина: {{ version.reason }}</template>
      </p>
      <section v-if="previous" aria-labelledby="version-changes">
        <h3 id="version-changes">Изменения относительно версии {{ previous.versionNumber }}</h3>
        <VersionChanges :changes="changes" />
      </section>
      <p v-else class="version__meta">Первая утверждённая версия маршрута.</p>
      <section aria-labelledby="version-snapshot" class="version">
        <h3 id="version-snapshot">Маршрут в этой версии</h3>
        <TrajectoryPassport :trajectory="asTrajectory" />
        <StageMap
          :stages="asTrajectory.stages"
          :support-methods="asTrajectory.supportMethods"
          :progress="false"
        />
      </section>
    </div>
  </Dialog>
</template>

<style scoped>
.version {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.version h3 {
  margin: 0 0 var(--iot-space-2);
  font-size: 1rem;
}

.version__meta {
  margin: 0;
  color: var(--iot-color-muted);
}
</style>
