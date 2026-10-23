<script setup lang="ts">
import type { LessonOptionsDto } from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import DateInput from '@/components/DateInput.vue';

/**
 * Добавление занятия вручную: дата, время, группа, дисциплина, преподаватель. Преподаватель
 * выбирает только свои пары группа — дисциплина; администратор — любые и указывает преподавателя.
 */
const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ options: LessonOptionsDto | null }>();
const emit = defineEmits<{ created: [] }>();

const form = reactive({
  date: '',
  startTime: '',
  groupId: null as string | null,
  disciplineId: null as string | null,
  teacherId: null as string | null,
});
const fields = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const saving = ref(false);

const chooseTeacher = computed(() => props.options?.pairs === null);
/** Дисциплины, которые преподаватель ведёт в выбранной группе. */
const disciplines = computed(() => {
  const options = props.options;
  if (!options) return [];
  if (!options.pairs) return options.disciplines;
  const allowed = new Set(
    options.pairs.filter((pair) => pair.groupId === form.groupId).map((pair) => pair.disciplineId),
  );
  return options.disciplines.filter((item) => allowed.has(item.id));
});

watch(visible, (open) => {
  if (!open) return;
  Object.assign(form, { date: '', startTime: '', groupId: null, disciplineId: null });
  form.teacherId = null;
  fields.value = {};
  error.value = null;
});
watch(
  () => form.groupId,
  () => {
    if (!disciplines.value.some((item) => item.id === form.disciplineId)) form.disciplineId = null;
    if (disciplines.value.length === 1) form.disciplineId = disciplines.value[0]!.id;
  },
);

async function save(): Promise<void> {
  const missing: Record<string, string> = {};
  if (!form.date) missing.date = 'Укажите дату занятия';
  if (!/^\d{1,2}:\d{2}$/.test(form.startTime.trim())) missing.startTime = 'Укажите время ЧЧ:ММ';
  if (!form.groupId) missing.groupId = 'Выберите группу';
  if (!form.disciplineId) missing.disciplineId = 'Выберите дисциплину';
  if (chooseTeacher.value && !form.teacherId) missing.teacherId = 'Выберите преподавателя';
  fields.value = missing;
  if (Object.keys(missing).length > 0) return;
  error.value = null;
  saving.value = true;
  try {
    await api('/lessons', {
      method: 'POST',
      body: { ...form, startTime: form.startTime.trim() },
    });
    visible.value = false;
    emit('created');
  } catch (failure) {
    if (failure instanceof ApiError) {
      fields.value = failure.fields;
      error.value = failure.message;
    } else {
      error.value = 'Не удалось добавить занятие';
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Новое занятие"
    :style="{ width: '32rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <div class="lesson-dialog__row">
        <div class="iot-field">
          <label for="lesson-date">Дата</label>
          <DateInput v-model="form.date" input-id="lesson-date" :invalid="!!fields.date" fluid />
          <small v-if="fields.date" class="iot-field-error">{{ fields.date }}</small>
        </div>
        <div class="iot-field">
          <label for="lesson-time">Время начала</label>
          <InputText
            id="lesson-time"
            v-model="form.startTime"
            placeholder="08:30"
            inputmode="numeric"
            :invalid="!!fields.startTime"
            fluid
          />
          <small v-if="fields.startTime" class="iot-field-error">{{ fields.startTime }}</small>
        </div>
      </div>
      <div class="iot-field">
        <label for="lesson-group">Группа</label>
        <Select
          v-model="form.groupId"
          input-id="lesson-group"
          :options="options?.groups ?? []"
          option-label="name"
          option-value="id"
          placeholder="Выберите"
          filter
          empty-message="Нет доступных групп"
          :invalid="!!fields.groupId"
          fluid
        />
        <small v-if="fields.groupId" class="iot-field-error">{{ fields.groupId }}</small>
      </div>
      <div class="iot-field">
        <label for="lesson-discipline">Дисциплина</label>
        <Select
          v-model="form.disciplineId"
          input-id="lesson-discipline"
          :options="disciplines"
          option-label="name"
          option-value="id"
          placeholder="Выберите"
          filter
          :empty-message="form.groupId ? 'Нет дисциплин в этой группе' : 'Сначала выберите группу'"
          :invalid="!!fields.disciplineId"
          fluid
        />
        <small v-if="fields.disciplineId" class="iot-field-error">{{ fields.disciplineId }}</small>
      </div>
      <div v-if="chooseTeacher" class="iot-field">
        <label for="lesson-teacher">Преподаватель</label>
        <Select
          v-model="form.teacherId"
          input-id="lesson-teacher"
          :options="options?.teachers ?? []"
          option-label="fullName"
          option-value="id"
          placeholder="Выберите"
          filter
          empty-message="Нет активных преподавателей"
          :invalid="!!fields.teacherId"
          fluid
        />
        <small v-if="fields.teacherId" class="iot-field-error">{{ fields.teacherId }}</small>
      </div>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Добавить" icon="pi pi-plus" :loading="saving" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.lesson-dialog__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--iot-space-3);
}
</style>
