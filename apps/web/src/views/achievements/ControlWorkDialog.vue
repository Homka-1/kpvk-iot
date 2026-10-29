<script setup lang="ts">
import {
  CONTROL_CRITERIA_MAX,
  CONTROL_TOPIC_MAX,
  type ControlKind,
  type ControlOptionsDto,
  type ControlWorkDetailDto,
  type ControlWorkDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import { KIND_OPTIONS } from './format';

/**
 * Создание и изменение контрольной работы: дисциплина, тема, вид контроля, критерии оценивания
 * и группы с датой проведения в каждой. Одна работа для нескольких групп — одинаковое задание и
 * рубрика (сравнение ЭГ и КГ). Преподаватель выбирает только группы, где ведёт дисциплину.
 */
const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ options: ControlOptionsDto | null; work?: ControlWorkDto | null }>();
const emit = defineEmits<{ saved: [detail: ControlWorkDetailDto] }>();

const form = reactive({
  disciplineId: null as string | null,
  topic: '',
  kind: 'ENTRY' as ControlKind,
  criteria: '',
  dates: {} as Record<string, string>,
  selected: [] as string[],
});
const fields = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const saving = ref(false);
let idempotencyKey = newIdempotencyKey();

/** Дисциплины, которые пользователь ведёт хотя бы в одной группе. */
const disciplines = computed(() => {
  const options = props.options;
  if (!options) return [];
  if (!options.pairs) return options.disciplines;
  const allowed = new Set(options.pairs.map((pair) => pair.disciplineId));
  return options.disciplines.filter((item) => allowed.has(item.id));
});
/** Группы, где пользователь ведёт выбранную дисциплину. */
const groups = computed(() => {
  const options = props.options;
  if (!options || !form.disciplineId) return [];
  if (!options.pairs) return options.groups;
  const allowed = new Set(
    options.pairs
      .filter((pair) => pair.disciplineId === form.disciplineId)
      .map((pair) => pair.groupId),
  );
  return options.groups.filter((group) => allowed.has(group.id));
});

watch(visible, (open) => {
  if (!open) return;
  const work = props.work;
  Object.assign(form, {
    disciplineId: work?.discipline.id ?? null,
    topic: work?.topic ?? '',
    kind: work?.kind ?? 'ENTRY',
    criteria: work?.criteria ?? '',
    dates: Object.fromEntries((work?.groups ?? []).map((item) => [item.group.id, item.date])),
    selected: (work?.groups ?? []).map((item) => item.group.id),
  });
  fields.value = {};
  error.value = null;
  idempotencyKey = newIdempotencyKey();
});

watch(
  () => form.disciplineId,
  () => {
    const available = new Set(groups.value.map((group) => group.id));
    form.selected = form.selected.filter((id) => available.has(id));
  },
);

/** Новой выбранной группе подставляется уже указанная дата: обычно работы проходят в одну неделю. */
watch(
  () => [...form.selected],
  (selected) => {
    const known = selected.map((id) => form.dates[id]).find((date) => date);
    for (const id of selected) {
      if (!form.dates[id] && known) form.dates[id] = known;
    }
  },
);

async function save(): Promise<void> {
  const missing: Record<string, string> = {};
  if (!form.disciplineId) missing.disciplineId = 'Выберите дисциплину';
  if (!form.topic.trim()) missing.topic = 'Укажите тему';
  if (form.selected.length === 0) missing.groups = 'Выберите хотя бы одну группу';
  for (const id of form.selected) {
    if (!form.dates[id]) missing[`date-${id}`] = 'Укажите дату проведения';
  }
  fields.value = missing;
  if (Object.keys(missing).length > 0) return;
  error.value = null;
  saving.value = true;
  const selected = groups.value.filter((group) => form.selected.includes(group.id));
  const body = {
    disciplineId: form.disciplineId,
    topic: form.topic.trim(),
    kind: form.kind,
    criteria: form.criteria.trim() || null,
    groups: selected.map((group) => ({ groupId: group.id, date: form.dates[group.id] })),
  };
  try {
    const detail = props.work
      ? await api<ControlWorkDetailDto>(`/control-works/${props.work.id}`, { method: 'PUT', body })
      : await api<ControlWorkDetailDto>('/control-works', {
          method: 'POST',
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
        });
    visible.value = false;
    emit('saved', detail);
  } catch (failure) {
    if (failure instanceof ApiError) {
      // Ошибки по группам приходят как groups.N — показываем их у группы.
      fields.value = Object.fromEntries(
        Object.entries(failure.fields).map(([key, message]) => {
          const match = /^groups\.(\d+)/.exec(key);
          return [match ? `date-${selected[Number(match[1])]?.id}` : key, message];
        }),
      );
      error.value = failure.message;
    } else {
      error.value = 'Не удалось сохранить работу';
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
    :header="work ? 'Изменение контрольной работы' : 'Новая контрольная работа'"
    :style="{ width: '40rem' }"
    :breakpoints="{ '640px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit.prevent="save">
      <div class="work-dialog__row">
        <div class="iot-field">
          <label for="work-discipline">Дисциплина</label>
          <Select
            v-model="form.disciplineId"
            input-id="work-discipline"
            :options="disciplines"
            option-label="name"
            option-value="id"
            placeholder="Выберите"
            filter
            empty-message="Нет дисциплин"
            :invalid="!!fields.disciplineId"
            fluid
          />
          <small v-if="fields.disciplineId" class="iot-field-error">{{
            fields.disciplineId
          }}</small>
        </div>
        <div class="iot-field">
          <label for="work-kind">Вид контроля</label>
          <Select
            v-model="form.kind"
            input-id="work-kind"
            :options="KIND_OPTIONS"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
      </div>
      <div class="iot-field">
        <label for="work-topic">Тема</label>
        <InputText
          id="work-topic"
          v-model="form.topic"
          :maxlength="CONTROL_TOPIC_MAX"
          placeholder="Например, «Создание веб-страниц»"
          :invalid="!!fields.topic"
          fluid
        />
        <small v-if="fields.topic" class="iot-field-error">{{ fields.topic }}</small>
      </div>
      <div class="iot-field">
        <label for="work-criteria">Критерии оценивания</label>
        <Textarea
          id="work-criteria"
          v-model="form.criteria"
          :maxlength="CONTROL_CRITERIA_MAX"
          rows="4"
          auto-resize
          placeholder="Например: структура HTML — 40 баллов; оформление CSS — 40; аккуратность — 20"
          fluid
        />
        <small class="iot-field-hint">
          Единая рубрика для всех групп; итог — балл по шкале 0–100.
        </small>
      </div>
      <fieldset class="work-dialog__groups">
        <legend>Группы и дата проведения</legend>
        <p v-if="!form.disciplineId" class="work-dialog__muted">Сначала выберите дисциплину.</p>
        <p v-else-if="groups.length === 0" class="work-dialog__muted">
          Вы не ведёте эту дисциплину ни в одной группе.
        </p>
        <div v-for="group in groups" :key="group.id" class="work-dialog__group">
          <label class="work-dialog__check">
            <Checkbox v-model="form.selected" :value="group.id" :input-id="`work-g-${group.id}`" />
            <span>{{ group.name }}</span>
          </label>
          <div v-if="form.selected.includes(group.id)" class="iot-field">
            <label :for="`work-date-${group.id}`" class="iot-visually-hidden">
              Дата проведения в группе {{ group.name }}
            </label>
            <DateInput
              v-model="form.dates[group.id]"
              :input-id="`work-date-${group.id}`"
              :invalid="!!fields[`date-${group.id}`]"
            />
            <small v-if="fields[`date-${group.id}`]" class="iot-field-error">
              {{ fields[`date-${group.id}`] }}
            </small>
          </div>
        </div>
        <small v-if="fields.groups" class="iot-field-error">{{ fields.groups }}</small>
      </fieldset>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button type="button" label="Отмена" severity="secondary" text @click="visible = false" />
        <Button
          type="submit"
          :label="work ? 'Сохранить' : 'Создать'"
          :icon="work ? 'pi pi-save' : 'pi pi-plus'"
          :loading="saving"
        />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.work-dialog__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--iot-space-3);
}

.work-dialog__groups {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: var(--iot-space-3);
  border: 1px solid var(--iot-color-border);
  border-radius: var(--iot-radius);
}

.work-dialog__groups legend {
  padding: 0 var(--iot-space-1);
  font-weight: 600;
}

.work-dialog__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.work-dialog__check {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-2);
  cursor: pointer;
}

.work-dialog__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
