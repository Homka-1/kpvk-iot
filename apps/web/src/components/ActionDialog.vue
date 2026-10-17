<script setup lang="ts">
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';
import { ref, watch } from 'vue';

/** Подтверждение действия; при `requireReason` — с обязательной причиной для журнала аудита. */
const props = withDefaults(
  defineProps<{
    title: string;
    message: string;
    confirmLabel: string;
    requireReason?: boolean;
    danger?: boolean;
    busy?: boolean;
    error?: string | null;
  }>(),
  { requireReason: false, danger: false, busy: false, error: null },
);
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ confirm: [reason: string] }>();

const reason = ref('');
const reasonError = ref<string | null>(null);

watch(visible, (open) => {
  if (open) {
    reason.value = '';
    reasonError.value = null;
  }
});

function confirm(): void {
  const value = reason.value.trim();
  if (props.requireReason && !value) {
    reasonError.value = 'Укажите причину';
    return;
  }
  emit('confirm', value);
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="title"
    :style="{ width: '28rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="action-dialog" novalidate @submit.prevent="confirm">
      <p>{{ message }}</p>
      <div v-if="requireReason" class="action-dialog__field">
        <label for="action-reason">Причина</label>
        <Textarea
          id="action-reason"
          v-model="reason"
          rows="3"
          maxlength="500"
          :invalid="!!reasonError"
          aria-describedby="action-reason-error"
          fluid
        />
        <small v-if="reasonError" id="action-reason-error" class="action-dialog__error">
          {{ reasonError }}
        </small>
      </div>
      <p v-if="error" class="action-dialog__error" role="alert">{{ error }}</p>
      <div class="action-dialog__buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button
          type="submit"
          :label="confirmLabel"
          :severity="danger ? 'danger' : undefined"
          :loading="busy"
        />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.action-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.action-dialog p {
  margin: 0;
}

.action-dialog__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.action-dialog__field label {
  font-weight: 600;
}

.action-dialog__error {
  color: var(--iot-tone-danger-text);
}

.action-dialog__buttons {
  display: flex;
  justify-content: flex-end;
  gap: var(--iot-space-2);
}
</style>
