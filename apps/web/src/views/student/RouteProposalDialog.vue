<script setup lang="ts">
import { ROUTE_PROPOSAL_MAX, type RouteProposalDto } from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';

/**
 * Предложение изменить маршрут (п. 2.3): студент описывает, что хотел бы изменить. Маршрут
 * не меняется — предложение получает преподаватель, решение за ним.
 */
const props = defineProps<{
  trajectoryId: string;
  stages: { id: string; title: string; sortOrder: number }[];
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [proposal: RouteProposalDto] }>();

const stageId = ref<string | null>(null);
const body = ref('');
const bodyError = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

watch(visible, (open) => {
  if (!open) return;
  stageId.value = null;
  body.value = '';
  bodyError.value = null;
  error.value = null;
  idempotencyKey = newIdempotencyKey();
});

const stageOptions = () =>
  props.stages.map((stage) => ({
    value: stage.id,
    label: `Этап ${stage.sortOrder + 1}. ${stage.title}`,
  }));

async function send(): Promise<void> {
  const text = body.value.trim();
  bodyError.value = text ? null : 'Опишите, что вы предлагаете изменить';
  if (bodyError.value) return;
  busy.value = true;
  error.value = null;
  try {
    const created = await api<RouteProposalDto>(
      `/cabinet/trajectories/${props.trajectoryId}/proposals`,
      {
        method: 'POST',
        body: { body: text, stageId: stageId.value },
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    );
    visible.value = false;
    emit('created', created);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось отправить предложение';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Предложить изменение маршрута"
    :style="{ width: '32rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="proposal" novalidate @submit.prevent="send">
      <p class="proposal__hint">
        Преподаватель рассмотрит предложение и при необходимости скорректирует маршрут. Обязательные
        этапы меняет только преподаватель.
      </p>
      <div class="proposal__field">
        <label id="proposal-stage-label" for="proposal-stage">Этап (необязательно)</label>
        <Select
          v-model="stageId"
          input-id="proposal-stage"
          aria-labelledby="proposal-stage-label"
          :options="stageOptions()"
          option-label="label"
          option-value="value"
          placeholder="Маршрут в целом"
          show-clear
        />
      </div>
      <div class="proposal__field">
        <label for="proposal-body">Что изменить и почему</label>
        <Textarea
          id="proposal-body"
          v-model="body"
          rows="4"
          :maxlength="ROUTE_PROPOSAL_MAX"
          :invalid="!!bodyError"
          aria-describedby="proposal-body-error"
        />
        <small v-if="bodyError" id="proposal-body-error" class="iot-field-error">
          {{ bodyError }}
        </small>
      </div>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="proposal__actions">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Отправить" icon="pi pi-send" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.proposal {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.proposal__hint {
  margin: 0;
  color: var(--iot-color-muted);
}

.proposal__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.proposal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  justify-content: flex-end;
}
</style>
