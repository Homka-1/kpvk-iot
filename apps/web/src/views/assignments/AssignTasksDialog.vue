<script setup lang="ts">
import {
  ASSIGN_TASKS_MAX,
  type AssignTasksResultDto,
  CHOICE_TITLE_MAX,
  formatFullName,
  type LibraryAssignmentDto,
  type StudentPageDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import DateInput from '@/components/DateInput.vue';
import { useContextStore } from '@/stores/context';
import { dueAtFromDate } from '@/views/trajectories/content';

/**
 * Назначение задания библиотеки студенту, нескольким студентам или группе (FR-048). Можно
 * предложить набор равнозначных заданий, из которых студент выбирает сам (FR-054).
 * Права и область (свои группы и дисциплины) проверяет сервер.
 */
const props = defineProps<{ assignment: LibraryAssignmentDto }>();
const visible = defineModel<boolean>('visible', { required: true });
const context = useContextStore();

const target = ref<'group' | 'students'>('group');
const groupId = ref<string | null>(null);
const studentIds = ref<string[]>([]);
const dueDate = ref('');
const withChoice = ref(false);
const alternatives = ref<string[]>([]);
const choiceTitle = ref('');
const requiredCount = ref(1);

const students = ref<{ id: string; label: string }[]>([]);
const library = ref<{ id: string; label: string }[]>([]);
const errors = reactive<Record<string, string | undefined>>({});
const error = ref<string | null>(null);
const busy = ref(false);
const result = ref<AssignTasksResultDto | null>(null);
let idempotencyKey = newIdempotencyKey();

const groups = computed(() => context.groups.filter((group) => !group.archivedAt));
const offered = computed(() => 1 + alternatives.value.length);

function clearErrors(): void {
  for (const key of Object.keys(errors)) delete errors[key];
  error.value = null;
}

watch(visible, async (open) => {
  if (!open) return;
  clearErrors();
  result.value = null;
  idempotencyKey = newIdempotencyKey();
  target.value = 'group';
  groupId.value = context.groupId;
  studentIds.value = [];
  dueDate.value = '';
  withChoice.value = false;
  alternatives.value = [];
  choiceTitle.value = `Выбор задания: ${props.assignment.topic || props.assignment.title}`;
  requiredCount.value = 1;
  try {
    const items = await api<LibraryAssignmentDto[]>('/library-assignments', {
      query: { disciplineId: props.assignment.discipline.id },
    });
    library.value = items
      .filter((item) => item.id !== props.assignment.id && !item.archivedAt)
      .map((item) => ({ id: item.id, label: item.title }));
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить задания';
  }
});

watch([groupId, target], async () => {
  studentIds.value = [];
  students.value = [];
  if (target.value !== 'students' || !groupId.value) return;
  try {
    const page = await api<StudentPageDto>('/students', {
      query: { groupId: groupId.value, pageSize: 100 },
    });
    students.value = page.items.map((item) => ({
      id: item.id,
      label: `${formatFullName(item)} (${item.participantCode})`,
    }));
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить студентов';
  }
});

function validate(): boolean {
  clearErrors();
  if (!groupId.value) errors.groupId = 'Выберите группу';
  if (target.value === 'students' && studentIds.value.length === 0) {
    errors.studentIds = 'Выберите студентов';
  }
  if (dueDate.value && !dueAtFromDate(dueDate.value)) errors.dueAt = 'Введите дату дд/мм/гггг';
  if (withChoice.value) {
    if (alternatives.value.length === 0) {
      errors.alternatives = 'Добавьте хотя бы одно равнозначное задание';
    }
    if (!choiceTitle.value.trim()) errors.choiceTitle = 'Укажите название набора';
    if (!requiredCount.value || requiredCount.value >= offered.value) {
      errors.requiredCount = 'Выбрать нужно меньше заданий, чем предложено';
    }
  }
  return Object.keys(errors).length === 0;
}

async function submit(): Promise<void> {
  if (!validate()) return;
  busy.value = true;
  try {
    result.value = await api<AssignTasksResultDto>('/student-assignments', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        assignmentIds: withChoice.value
          ? [props.assignment.id, ...alternatives.value]
          : [props.assignment.id],
        ...(target.value === 'group'
          ? { groupId: groupId.value }
          : { studentIds: studentIds.value }),
        dueAt: dueDate.value ? dueAtFromDate(dueDate.value) : null,
        choice: withChoice.value
          ? { title: choiceTitle.value.trim(), requiredCount: requiredCount.value }
          : null,
      },
    });
  } catch (caught) {
    if (caught instanceof ApiError) {
      error.value = caught.message;
      Object.assign(errors, caught.fields ?? {});
    } else {
      error.value = 'Не удалось назначить задание';
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
    :header="`Назначить: ${assignment.title}`"
    :style="{ width: '36rem' }"
    :breakpoints="{ '640px': '95vw' }"
  >
    <div v-if="result" class="assign-tasks" role="status">
      <Message :severity="result.assigned.length ? 'success' : 'warn'" :closable="false">
        {{
          result.assigned.length
            ? `Назначено студентам: ${result.assigned.length}. Они получили уведомление.`
            : 'Задание никому не назначено.'
        }}
      </Message>
      <template v-if="result.skipped.length">
        <p class="assign-tasks__muted">Пропущены:</p>
        <ul class="assign-tasks__skipped">
          <li v-for="item in result.skipped" :key="item.student.id">
            {{ item.student.fullName }} — {{ item.reason }}
          </li>
        </ul>
      </template>
      <div class="assign-tasks__actions">
        <Button label="Готово" @click="visible = false" />
      </div>
    </div>

    <form v-else class="assign-tasks" novalidate @submit.prevent="submit">
      <fieldset class="assign-tasks__group">
        <legend>Кому</legend>
        <div class="assign-tasks__radio">
          <RadioButton v-model="target" input-id="assign-target-group" value="group" />
          <label for="assign-target-group">Всей группе</label>
        </div>
        <div class="assign-tasks__radio">
          <RadioButton v-model="target" input-id="assign-target-students" value="students" />
          <label for="assign-target-students">Отдельным студентам</label>
        </div>
      </fieldset>

      <div class="assign-tasks__field">
        <label id="assign-group-label" for="assign-group">Группа</label>
        <Select
          v-model="groupId"
          input-id="assign-group"
          aria-labelledby="assign-group-label"
          :options="groups"
          option-label="name"
          option-value="id"
          placeholder="Выберите группу"
          :invalid="!!errors.groupId"
        />
        <small v-if="errors.groupId" class="iot-field-error">{{ errors.groupId }}</small>
      </div>

      <div v-if="target === 'students'" class="assign-tasks__field">
        <label id="assign-students-label" for="assign-students">Студенты</label>
        <MultiSelect
          v-model="studentIds"
          input-id="assign-students"
          aria-labelledby="assign-students-label"
          :options="students"
          option-label="label"
          option-value="id"
          filter
          display="chip"
          placeholder="Выберите студентов"
          :invalid="!!errors.studentIds"
        />
        <small v-if="errors.studentIds" class="iot-field-error">{{ errors.studentIds }}</small>
      </div>

      <div class="assign-tasks__field">
        <label for="assign-due">Срок сдачи (необязательно)</label>
        <DateInput v-model="dueDate" input-id="assign-due" :invalid="!!errors.dueAt" />
        <small v-if="errors.dueAt" class="iot-field-error">{{ errors.dueAt }}</small>
      </div>

      <div class="assign-tasks__radio">
        <Checkbox v-model="withChoice" input-id="assign-choice" binary />
        <label for="assign-choice">Дать студенту выбор из равнозначных заданий</label>
      </div>

      <template v-if="withChoice">
        <div class="assign-tasks__field">
          <label id="assign-alternatives-label" for="assign-alternatives"
            >Другие равнозначные задания</label
          >
          <MultiSelect
            v-model="alternatives"
            input-id="assign-alternatives"
            aria-labelledby="assign-alternatives-label"
            :options="library"
            option-label="label"
            option-value="id"
            filter
            display="chip"
            :selection-limit="ASSIGN_TASKS_MAX - 1"
            placeholder="Задания той же дисциплины"
            :invalid="!!errors.alternatives || !!errors.assignmentIds"
          />
          <small v-if="errors.alternatives || errors.assignmentIds" class="iot-field-error">
            {{ errors.alternatives ?? errors.assignmentIds }}
          </small>
        </div>
        <div class="assign-tasks__field">
          <label for="assign-choice-title">Название набора</label>
          <InputText
            id="assign-choice-title"
            v-model="choiceTitle"
            :maxlength="CHOICE_TITLE_MAX"
            :invalid="!!errors.choiceTitle"
          />
          <small v-if="errors.choiceTitle" class="iot-field-error">{{ errors.choiceTitle }}</small>
        </div>
        <div class="assign-tasks__field">
          <label for="assign-required">Сколько заданий выбрать (из {{ offered }})</label>
          <InputNumber
            v-model="requiredCount"
            input-id="assign-required"
            :min="1"
            :max="ASSIGN_TASKS_MAX - 1"
            show-buttons
            :invalid="!!errors.requiredCount || !!errors['choice.requiredCount']"
          />
          <small
            v-if="errors.requiredCount || errors['choice.requiredCount']"
            class="iot-field-error"
          >
            {{ errors.requiredCount ?? errors['choice.requiredCount'] }}
          </small>
        </div>
      </template>

      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="assign-tasks__actions">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Назначить" icon="pi pi-send" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.assign-tasks {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.assign-tasks__group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
  padding: 0;
  border: 0;
}

.assign-tasks__group legend {
  margin-bottom: var(--iot-space-1);
  font-weight: 600;
}

.assign-tasks__radio {
  display: flex;
  gap: var(--iot-space-2);
  align-items: center;
}

.assign-tasks__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.assign-tasks__muted {
  margin: 0;
  color: var(--iot-color-muted);
}

.assign-tasks__skipped {
  margin: 0;
  padding-left: var(--iot-space-4);
}

.assign-tasks__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  justify-content: flex-end;
}
</style>
