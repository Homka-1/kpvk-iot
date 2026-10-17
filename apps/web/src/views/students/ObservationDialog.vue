<script setup lang="ts">
import {
  OBSERVATION_TEXT_MAX,
  type ObservationDto,
  observationFormSchema,
  type ProfileDisciplineDto,
  todayIsoDate,
} from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { useForm } from 'vee-validate';
import { ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';

/**
 * Добавление и изменение педагогического наблюдения (FR-014). По умолчанию наблюдение
 * служебное: его видят только преподаватели (FR-016). Открыть студенту — отдельный выбор.
 */
const props = defineProps<{
  studentId: string;
  /** Наблюдение для изменения; null — новое. */
  observation: ObservationDto | null;
  /** Дисциплины, которые пользователь ведёт в группе студента. */
  disciplines: ProfileDisciplineDto[];
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [observation: ObservationDto] }>();

const visibilityOptions = [
  {
    value: 'INTERNAL',
    label: 'Только преподавателям',
    hint: 'Служебная заметка. Студент её не увидит.',
  },
  {
    value: 'STUDENT_VISIBLE',
    label: 'Видно студенту',
    hint: 'Появится в разделе «Мой профиль» студента.',
  },
] as const;

const form = useForm({ validationSchema: toTypedSchema(observationFormSchema) });
const [observedAt, observedAtAttrs] = form.defineField('observedAt');
const [text, textAttrs] = form.defineField('text');
const [visibility] = form.defineField('visibility');
const [disciplineId] = form.defineField('disciplineId');
const busy = ref(false);
const error = ref<string | null>(null);
let idempotencyKey = newIdempotencyKey();

watch(visible, (open) => {
  if (!open) return;
  error.value = null;
  idempotencyKey = newIdempotencyKey();
  const item = props.observation;
  form.resetForm({
    values: {
      observedAt: item?.observedAt ?? todayIsoDate(),
      text: item?.text ?? '',
      visibility: item?.visibility ?? 'INTERNAL',
      disciplineId: item?.discipline?.id ?? '',
    },
  });
});

const save = form.handleSubmit(async (values) => {
  busy.value = true;
  error.value = null;
  const body = { ...values, disciplineId: values.disciplineId || null };
  try {
    const saved = props.observation
      ? await api<ObservationDto>(
          `/students/${props.studentId}/observations/${props.observation.id}`,
          { method: 'PATCH', body },
        )
      : await api<ObservationDto>(`/students/${props.studentId}/observations`, {
          method: 'POST',
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
        });
    emit('saved', saved);
    visible.value = false;
  } catch (caught) {
    if (caught instanceof ApiError) form.setErrors(caught.fields);
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось сохранить наблюдение';
  } finally {
    busy.value = false;
  }
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="observation ? 'Изменение наблюдения' : 'Новое педагогическое наблюдение'"
    :style="{ width: '36rem' }"
    :breakpoints="{ '767px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit="save">
      <div class="iot-field">
        <label for="observation-date">Дата наблюдения</label>
        <InputText
          id="observation-date"
          v-model="observedAt"
          v-bind="observedAtAttrs"
          type="date"
          :max="todayIsoDate()"
          :invalid="!!form.errors.value.observedAt"
          fluid
        />
        <small v-if="form.errors.value.observedAt" class="iot-field-error">
          {{ form.errors.value.observedAt }}
        </small>
      </div>
      <div class="iot-field">
        <label for="observation-discipline">Дисциплина (необязательно)</label>
        <Select
          v-model="disciplineId"
          input-id="observation-discipline"
          :options="disciplines"
          option-label="name"
          option-value="id"
          placeholder="Без привязки к дисциплине"
          empty-message="Вы не ведёте дисциплин в группе студента"
          show-clear
          :invalid="!!form.errors.value.disciplineId"
          fluid
        />
        <small v-if="form.errors.value.disciplineId" class="iot-field-error">
          {{ form.errors.value.disciplineId }}
        </small>
      </div>
      <div class="iot-field">
        <label for="observation-text">Наблюдение</label>
        <Textarea
          id="observation-text"
          v-model="text"
          v-bind="textAttrs"
          rows="5"
          :maxlength="OBSERVATION_TEXT_MAX"
          :invalid="!!form.errors.value.text"
          fluid
        />
        <small v-if="form.errors.value.text" class="iot-field-error">
          {{ form.errors.value.text }}
        </small>
      </div>
      <fieldset class="observation-dialog__visibility">
        <legend>Кому видно</legend>
        <div
          v-for="option in visibilityOptions"
          :key="option.value"
          class="observation-dialog__option"
        >
          <RadioButton
            v-model="visibility"
            :input-id="`observation-visibility-${option.value}`"
            :value="option.value"
            name="observation-visibility"
          />
          <label :for="`observation-visibility-${option.value}`">
            <strong>{{ option.label }}</strong>
            <span class="iot-field-hint">{{ option.hint }}</span>
          </label>
        </div>
      </fieldset>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Сохранить" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.observation-dialog__visibility {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.observation-dialog__visibility legend {
  margin-bottom: var(--iot-space-2);
  font-weight: 600;
}

.observation-dialog__option {
  display: flex;
  align-items: flex-start;
  gap: var(--iot-space-2);
}

.observation-dialog__option label {
  display: flex;
  flex-direction: column;
}
</style>
