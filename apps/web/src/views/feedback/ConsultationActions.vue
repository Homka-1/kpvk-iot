<script setup lang="ts">
import type { ConsultationDto } from '@iot/shared';
import { ref } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import ConsultationDialog from './ConsultationDialog.vue';
import ConsultationHeldDialog from './ConsultationHeldDialog.vue';

/**
 * Диалоги действий с консультацией: назначить время или перенести, отметить проведённой,
 * отменить с причиной. Родитель вызывает `schedule`, `hold`, `cancel` и получает `changed`.
 */
const emit = defineEmits<{ changed: [item: ConsultationDto] }>();

const target = ref<ConsultationDto | null>(null);
const scheduleOpen = ref(false);
const holdOpen = ref(false);
const cancelOpen = ref(false);
const cancelBusy = ref(false);
const cancelError = ref<string | null>(null);

function schedule(item: ConsultationDto): void {
  target.value = item;
  scheduleOpen.value = true;
}

function hold(item: ConsultationDto): void {
  target.value = item;
  holdOpen.value = true;
}

function cancel(item: ConsultationDto): void {
  target.value = item;
  cancelError.value = null;
  cancelOpen.value = true;
}

async function confirmCancel(reason: string): Promise<void> {
  if (!target.value) return;
  cancelBusy.value = true;
  cancelError.value = null;
  try {
    const updated = await api<ConsultationDto>(`/consultations/${target.value.id}/cancel`, {
      method: 'POST',
      body: { reason },
    });
    cancelOpen.value = false;
    emit('changed', updated);
  } catch (caught) {
    cancelError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось отменить консультацию';
  } finally {
    cancelBusy.value = false;
  }
}

defineExpose({ schedule, hold, cancel });
</script>

<template>
  <ConsultationDialog
    v-model:visible="scheduleOpen"
    :consultation="target"
    @saved="emit('changed', $event)"
  />
  <ConsultationHeldDialog
    v-model:visible="holdOpen"
    :consultation="target"
    @saved="emit('changed', $event)"
  />
  <ActionDialog
    v-model:visible="cancelOpen"
    title="Отменить консультацию"
    :message="
      target ? `«${target.topic}» · ${target.student.fullName}. Студент получит уведомление.` : ''
    "
    confirm-label="Отменить консультацию"
    require-reason
    danger
    :busy="cancelBusy"
    :error="cancelError"
    @confirm="confirmCancel"
  />
</template>
