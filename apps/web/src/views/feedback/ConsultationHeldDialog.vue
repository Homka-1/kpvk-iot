<script setup lang="ts">
import { CONSULTATION_TEXT_MAX, type ConsultationDto, todayIsoDate } from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import { splitDateTime, toIsoDateTime } from './content';

/**
 * Фиксация проведённой консультации (FR-067): когда проведена, итог для студента
 * и внутренняя заметка, которую видят только преподаватели (FR-068).
 */
const props = defineProps<{ consultation: ConsultationDto | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [item: ConsultationDto] }>();

const date = ref('');
const time = ref('');
const summary = ref('');
const internalNote = ref('');
const fields = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const busy = ref(false);

watch(visible, (open) => {
  if (!open) return;
  const now = splitDateTime(new Date());
  date.value = now.date;
  time.value = now.time;
  summary.value = '';
  internalNote.value = '';
  fields.value = {};
  error.value = null;
});

async function save(): Promise<void> {
  if (!props.consultation) return;
  const heldAt = toIsoDateTime(date.value, time.value.trim());
  const errors: Record<string, string> = {};
  if (!date.value) errors.heldAt = 'Укажите дату';
  else if (date.value > todayIsoDate()) errors.heldAt = 'Дата проведения не может быть в будущем';
  else if (!heldAt) errors.time = 'Укажите время в формате чч:мм';
  fields.value = errors;
  if (Object.keys(errors).length > 0) return;
  busy.value = true;
  error.value = null;
  try {
    const saved = await api<ConsultationDto>(`/consultations/${props.consultation.id}/held`, {
      method: 'POST',
      body: { heldAt, summary: summary.value, internalNote: internalNote.value },
    });
    visible.value = false;
    emit('saved', saved);
  } catch (caught) {
    if (caught instanceof ApiError) {
      error.value = caught.message;
      fields.value = caught.fields;
    } else {
      error.value = 'Не удалось сохранить консультацию';
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
    header="Консультация проведена"
    :style="{ width: '34rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <p v-if="consultation">«{{ consultation.topic }}» · {{ consultation.student.fullName }}</p>
      <div class="held__when">
        <div class="iot-field">
          <label for="held-date">Дата проведения</label>
          <DateInput
            v-model="date"
            input-id="held-date"
            :max="todayIsoDate()"
            :invalid="!!fields.heldAt"
            fluid
          />
          <small v-if="fields.heldAt" class="iot-field-error">{{ fields.heldAt }}</small>
        </div>
        <div class="iot-field">
          <label for="held-time">Время</label>
          <InputText
            id="held-time"
            v-model="time"
            placeholder="чч:мм"
            inputmode="numeric"
            maxlength="5"
            :invalid="!!fields.time"
            fluid
          />
          <small v-if="fields.time" class="iot-field-error">{{ fields.time }}</small>
        </div>
      </div>
      <div class="iot-field">
        <label for="held-summary">Итог для студента (необязательно)</label>
        <Textarea
          id="held-summary"
          v-model="summary"
          rows="3"
          :maxlength="CONSULTATION_TEXT_MAX"
          fluid
        />
        <small class="iot-field-hint">Студент увидит итог в разделе «Обратная связь».</small>
      </div>
      <div class="iot-field">
        <label for="held-note">Внутренняя заметка (необязательно)</label>
        <Textarea
          id="held-note"
          v-model="internalNote"
          rows="3"
          :maxlength="CONSULTATION_TEXT_MAX"
          fluid
        />
        <small class="iot-field-hint">
          <i class="pi pi-lock" aria-hidden="true" /> Видна только преподавателям, студенту не
          передаётся.
        </small>
      </div>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" icon="pi pi-check" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.held__when {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--iot-space-3);
}

@media (max-width: 479px) {
  .held__when {
    grid-template-columns: 1fr;
  }
}
</style>
