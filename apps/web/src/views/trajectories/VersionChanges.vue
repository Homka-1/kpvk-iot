<script setup lang="ts">
import type { TrajectoryChange, TrajectoryChangeKind } from '@iot/shared';
import { computed } from 'vue';
import StatusBadge, { type StatusTone } from '@/components/StatusBadge.vue';

/** Отличия версий ИОТ (UC-05, FR-043), сгруппированные по паспорту и этапам. */
const props = defineProps<{ changes: TrajectoryChange[] }>();

const KINDS: Record<TrajectoryChangeKind, { label: string; tone: StatusTone; icon: string }> = {
  added: { label: 'Добавлено', tone: 'success', icon: 'pi pi-plus' },
  removed: { label: 'Убрано', tone: 'danger', icon: 'pi pi-minus' },
  changed: { label: 'Изменено', tone: 'info', icon: 'pi pi-pencil' },
  moved: { label: 'Перемещено', tone: 'neutral', icon: 'pi pi-arrows-v' },
};

const groups = computed(() => {
  const map = new Map<string, TrajectoryChange[]>();
  for (const change of props.changes) {
    map.set(change.scope, [...(map.get(change.scope) ?? []), change]);
  }
  return [...map.entries()];
});
</script>

<template>
  <p v-if="changes.length === 0" class="changes__muted">Изменений нет.</p>
  <div v-else class="changes">
    <section v-for="[scope, items] in groups" :key="scope">
      <h4>{{ scope }}</h4>
      <ul>
        <li v-for="(change, index) in items" :key="index">
          <StatusBadge v-bind="KINDS[change.kind]" />
          <span class="changes__text">
            <strong>{{ change.subject }}</strong>
            <template v-if="change.kind === 'changed' || change.kind === 'moved'">
              : {{ change.before ?? 'не указано' }} → {{ change.after ?? 'не указано' }}
            </template>
            <template
              v-else-if="
                change.kind === 'added' && change.after && !change.subject.includes(change.after)
              "
            >
              : {{ change.after }}
            </template>
            <template
              v-else-if="
                change.kind === 'removed' &&
                change.before &&
                !change.subject.includes(change.before)
              "
            >
              : было {{ change.before }}
            </template>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.changes {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.changes h4 {
  margin: 0 0 var(--iot-space-1);
  font-size: 0.9375rem;
}

.changes ul {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.changes li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: baseline;
}

.changes__text {
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.changes__muted {
  margin: 0;
  color: var(--iot-color-muted);
}
</style>
