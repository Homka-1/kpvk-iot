<script setup lang="ts">
import {
  type CabinetConsultationDto,
  type ConsultationDto,
  type FeedbackDto,
  interactionTimeline,
  type ReflectionDto,
} from '@iot/shared';
import { computed, ref } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import ConsultationActions from './ConsultationActions.vue';
import ConsultationCard from './ConsultationCard.vue';
import FeedbackThread from './FeedbackThread.vue';
import ReflectionCard from './ReflectionCard.vue';

/**
 * История взаимодействия (FR-063): сообщения, консультации и рефлексия одной лентой,
 * новые сверху. У преподавателя — действия с консультациями и ответы в ветках.
 */
const props = withDefaults(
  defineProps<{
    feedback: FeedbackDto[];
    consultations: CabinetConsultationDto[];
    reflections: ReflectionDto[];
    mode: 'staff' | 'student';
    canManage?: boolean;
    emptyText?: string;
  }>(),
  { canManage: false, emptyText: 'Сообщений, консультаций и рефлексии пока нет.' },
);
const emit = defineEmits<{
  feedbackChanged: [item: FeedbackDto];
  consultationChanged: [item: ConsultationDto];
  reflect: [item: FeedbackDto];
}>();

const actions = ref<InstanceType<typeof ConsultationActions>>();
const entries = computed(() =>
  interactionTimeline({
    feedback: props.feedback,
    consultations: props.consultations,
    reflections: props.reflections,
  }),
);
const asStaff = (item: CabinetConsultationDto) => item as ConsultationDto;
</script>

<template>
  <EmptyState
    v-if="entries.length === 0"
    icon="pi pi-comments"
    title="История взаимодействия пуста"
    :description="emptyText"
  />
  <ol v-else class="timeline" aria-label="История взаимодействия">
    <li v-for="entry in entries" :key="`${entry.type}-${entry.item.id}`">
      <FeedbackThread
        v-if="entry.type === 'feedback'"
        :item="entry.item"
        :mode="mode"
        :can-reply="mode === 'student' || canManage"
        @changed="emit('feedbackChanged', $event)"
        @reflect="emit('reflect', $event)"
      />
      <ConsultationCard
        v-else-if="entry.type === 'consultation'"
        :item="entry.item"
        :mode="mode"
        :can-manage="canManage"
        @schedule="actions?.schedule(asStaff(entry.item))"
        @hold="actions?.hold(asStaff(entry.item))"
        @cancel="actions?.cancel(asStaff(entry.item))"
      />
      <ReflectionCard v-else :item="entry.item" />
    </li>
  </ol>
  <ConsultationActions
    v-if="mode === 'staff'"
    ref="actions"
    @changed="emit('consultationChanged', $event)"
  />
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
