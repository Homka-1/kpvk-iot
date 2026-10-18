<script setup lang="ts">
import {
  SUPPORT_REASON_MAX,
  SUPPORT_STATUS_LABELS,
  SupportStatus,
  type SupportStatusDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import RadioButton from 'primevue/radiobutton';
import Textarea from 'primevue/textarea';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';

/**
 * Отметка о необходимости дополнительного сопровождения (FR-060): статус и основание.
 * Основание сохраняется в журнале аудита и в истории студента.
 */
const props = defineProps<{ studentId: string; current: SupportStatus }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [status: SupportStatus] }>();

const status = ref<SupportStatus>(props.current);
const reason = ref('');
const errors = ref<Record<string, string>>({});
const message = ref<string | null>(null);
const busy = ref(false);

watch(visible, (open) => {
  if (!open) return;
  status.value = props.current;
  reason.value = '';
  errors.value = {};
  message.value = null;
});

async function save(): Promise<void> {
  errors.value = {};
  message.value = null;
  if (!reason.value.trim()) {
    errors.value = { reason: 'Укажите основание' };
    return;
  }
  busy.value = true;
  try {
    const saved = await api<SupportStatusDto>(
      `/monitoring/students/${props.studentId}/support-status`,
      { method: 'PUT', body: { supportStatus: status.value, reason: reason.value.trim() } },
    );
    emit('saved', saved.supportStatus);
    visible.value = false;
  } catch (caught) {
    if (caught instanceof ApiError) {
      errors.value = caught.fields;
      message.value = caught.message;
    } else {
      message.value = 'Не удалось сохранить отметку. Повторите попытку';
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Статус сопровождения"
    :style="{ width: '30rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <fieldset class="support__options">
        <legend>Нужно ли студенту дополнительное сопровождение?</legend>
        <div v-for="value in Object.values(SupportStatus)" :key="value" class="support__option">
          <RadioButton v-model="status" :input-id="`support-${value}`" :value="value" />
          <label :for="`support-${value}`">{{ SUPPORT_STATUS_LABELS[value] }}</label>
        </div>
      </fieldset>
      <div class="iot-field">
        <label for="support-reason">Основание</label>
        <Textarea
          id="support-reason"
          v-model="reason"
          rows="3"
          :maxlength="SUPPORT_REASON_MAX"
          :invalid="!!errors.reason"
          fluid
        />
        <small v-if="errors.reason" class="iot-field-error">{{ errors.reason }}</small>
      </div>
      <p v-if="message" class="iot-field-error" role="alert">{{ message }}</p>
      <div class="support__actions">
        <Button label="Отмена" severity="secondary" text type="button" @click="visible = false" />
        <Button label="Сохранить" icon="pi pi-check" type="submit" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.support__options {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.support__options legend {
  margin-bottom: var(--iot-space-2);
}

.support__option {
  display: flex;
  gap: var(--iot-space-2);
  align-items: center;
}

.support__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--iot-space-2);
}
</style>
