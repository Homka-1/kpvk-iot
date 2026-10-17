<script setup lang="ts">
import {
  defaultStudentSummary,
  MOTIVATION_LEVEL_LABELS,
  MOTIVATION_LEVELS,
  type MotivationProfileDto,
  PROFILE_REASON_MAX,
  PROFILE_STUDENT_SUMMARY_MAX,
  profileDecisionSchema,
} from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Textarea from 'primevue/textarea';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';

/**
 * Решение преподавателя по предложенному профилю (FR-029, AT-04): подтвердить предложенный
 * уровень или выбрать другой, указав причину. Пояснение для студента заполняется по текстам
 * правил интерпретации и редактируется (FR-016).
 */
const props = defineProps<{ profile: MotivationProfileDto }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ saved: [profile: MotivationProfileDto] }>();

const schema = computed(() => toTypedSchema(profileDecisionSchema(props.profile.proposedLevel)));
const form = useForm({ validationSchema: schema });
const [level] = form.defineField('level');
const [reason, reasonAttrs] = form.defineField('reason');
const [studentSummary, summaryAttrs] = form.defineField('studentSummary');
const busy = ref(false);
const error = ref<string | null>(null);
const corrected = computed(() => !!level.value && level.value !== props.profile.proposedLevel);

watch(visible, (open) => {
  if (!open) return;
  error.value = null;
  form.resetForm({
    values: {
      level: props.profile.proposedLevel ?? undefined,
      reason: '',
      studentSummary: defaultStudentSummary(props.profile.basis?.items ?? []),
    },
  });
});

const save = form.handleSubmit(async (values) => {
  busy.value = true;
  error.value = null;
  try {
    const saved = await api<MotivationProfileDto>(
      `/motivation-profiles/${props.profile.id}/decision`,
      { method: 'POST', body: values },
    );
    emit('saved', saved);
    visible.value = false;
  } catch (caught) {
    if (caught instanceof ApiError) form.setErrors(caught.fields);
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось сохранить решение';
  } finally {
    busy.value = false;
  }
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Решение по мотивационному профилю"
    :style="{ width: '36rem' }"
    :breakpoints="{ '767px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit="save">
      <fieldset class="decision__levels">
        <legend>Уровень профиля</legend>
        <div v-for="item in MOTIVATION_LEVELS" :key="item" class="decision__level">
          <RadioButton v-model="level" :input-id="`decision-${item}`" :value="item" name="level" />
          <label :for="`decision-${item}`">
            {{ MOTIVATION_LEVEL_LABELS[item] }}
            <span v-if="item === profile.proposedLevel" class="decision__muted">
              — предложен системой
            </span>
          </label>
        </div>
        <small v-if="form.errors.value.level" class="iot-field-error">
          {{ form.errors.value.level }}
        </small>
      </fieldset>
      <div class="iot-field">
        <label for="decision-reason">
          {{ corrected ? 'Причина корректировки' : 'Комментарий (необязательно)' }}
        </label>
        <Textarea
          id="decision-reason"
          v-model="reason"
          v-bind="reasonAttrs"
          rows="3"
          :maxlength="PROFILE_REASON_MAX"
          :invalid="!!form.errors.value.reason"
          aria-describedby="decision-reason-hint"
          fluid
        />
        <small id="decision-reason-hint" class="decision__muted">
          Видно только преподавателям. Сохраняется в истории профиля.
        </small>
        <small v-if="form.errors.value.reason" class="iot-field-error">
          {{ form.errors.value.reason }}
        </small>
      </div>
      <div class="iot-field">
        <label for="decision-summary">Пояснение для студента</label>
        <Textarea
          id="decision-summary"
          v-model="studentSummary"
          v-bind="summaryAttrs"
          rows="4"
          :maxlength="PROFILE_STUDENT_SUMMARY_MAX"
          :invalid="!!form.errors.value.studentSummary"
          aria-describedby="decision-summary-hint"
          fluid
        />
        <small id="decision-summary-hint" class="decision__muted">
          Студент увидит этот текст в разделе «Мой профиль». Уровень и основания ему не
          показываются.
        </small>
        <small v-if="form.errors.value.studentSummary" class="iot-field-error">
          {{ form.errors.value.studentSummary }}
        </small>
      </div>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button
          type="submit"
          :label="corrected ? 'Скорректировать' : 'Подтвердить'"
          icon="pi pi-check"
          :loading="busy"
        />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.decision__levels {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.decision__levels legend {
  margin-bottom: var(--iot-space-1);
  font-weight: 600;
}

.decision__level {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.decision__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
