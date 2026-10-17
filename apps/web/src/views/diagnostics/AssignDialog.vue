<script setup lang="ts">
import {
  assignmentFormSchema,
  type DiagnosticAssignmentDetailDto,
  formatFullName,
  localDayStart,
  MEASUREMENT_TYPE_LABELS,
  MeasurementType,
  type QuestionnaireDetailDto,
  type QuestionnaireSummaryDto,
  type StudentPageDto,
  todayIsoDate,
} from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { api, ApiError, newIdempotencyKey } from '@/api/http';
import { useContextStore } from '@/stores/context';

/**
 * Назначение диагностики (UC-01, шаги 2–4; FR-018, FR-019): методика с действующей версией,
 * группа или студент из доступных пользователю, период прохождения по датам. Промежуточный
 * и повторный замер можно провести по прежней версии, чтобы сравнить с первичным (UC-06).
 */
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [assignment: DiagnosticAssignmentDetailDto] }>();
const context = useContextStore();

const questionnaires = ref<QuestionnaireSummaryDto[]>([]);
const detail = ref<QuestionnaireDetailDto | null>(null);
const students = ref<{ id: string; label: string }[]>([]);
const loadError = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
let idempotencyKey = newIdempotencyKey();

const form = useForm({ validationSchema: toTypedSchema(assignmentFormSchema) });
const [questionnaireId] = form.defineField('questionnaireId');
const [measurementType] = form.defineField('measurementType');
const [versionId] = form.defineField('versionId');
const [targetKind] = form.defineField('targetKind');
const [groupId] = form.defineField('groupId');
const [studentId] = form.defineField('studentId');
const [startsOn, startsOnAttrs] = form.defineField('startsOn');
const [endsOn, endsOnAttrs] = form.defineField('endsOn');

const groups = computed(() => context.groups.filter((group) => !group.archivedAt));
const published = computed(() => questionnaires.value.filter((item) => item.published));
const measurementTypes = Object.values(MeasurementType).map((value) => ({
  value,
  label: MEASUREMENT_TYPE_LABELS[value],
}));
const isPrimary = computed(() => measurementType.value === MeasurementType.PRIMARY);

/** Опубликованные ранее версии с отметкой действующей и сопоставимых (UC-06). */
const versions = computed(() => {
  const info = detail.value;
  if (!info) return [];
  const published = info.versions.filter((version) => version.status !== 'DRAFT');
  const number = new Map(published.map((version) => [version.id, version.versionNumber]));
  return published.map((version) => {
    const comparable = info.comparabilities
      .flatMap((pair) =>
        pair.versionAId === version.id
          ? [pair.versionBId]
          : pair.versionBId === version.id
            ? [pair.versionAId]
            : [],
      )
      .map((id) => number.get(id))
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b);
    const parts = [`Версия ${version.versionNumber}`];
    if (version.status === 'PUBLISHED') parts.push('действующая');
    if (comparable.length > 0) parts.push(`сопоставима с ${comparable.join(', ')}`);
    return { id: version.id, label: parts.join(' · ') };
  });
});

watch(visible, async (open) => {
  if (!open) return;
  error.value = null;
  loadError.value = null;
  idempotencyKey = newIdempotencyKey();
  const week = new Date();
  week.setDate(week.getDate() + 7);
  form.resetForm({
    values: {
      questionnaireId: '',
      measurementType: MeasurementType.PRIMARY,
      versionId: null,
      targetKind: 'group',
      groupId: context.groupId,
      studentId: null,
      startsOn: todayIsoDate(),
      endsOn: todayIsoDate(week),
    },
  });
  try {
    questionnaires.value = await api<QuestionnaireSummaryDto[]>('/questionnaires');
  } catch (caught) {
    loadError.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить методики';
  }
});

watch([questionnaireId, isPrimary], async ([id, primary]) => {
  versionId.value = null;
  detail.value = null;
  if (!id || primary) return;
  try {
    const loaded = await api<QuestionnaireDetailDto>(`/questionnaires/${id}`);
    if (questionnaireId.value !== id) return;
    detail.value = loaded;
    versionId.value = loaded.versions.find((version) => version.status === 'PUBLISHED')?.id ?? null;
  } catch (caught) {
    loadError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось загрузить версии методики';
  }
});

watch([groupId, targetKind], async () => {
  studentId.value = null;
  students.value = [];
  if (targetKind.value !== 'student' || !groupId.value) return;
  try {
    const page = await api<StudentPageDto>('/students', {
      query: { groupId: groupId.value, pageSize: 100 },
    });
    students.value = page.items.map((item) => ({
      id: item.id,
      label: `${formatFullName(item)} (${item.participantCode})`,
    }));
  } catch (caught) {
    loadError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось загрузить студентов';
  }
});

const submit = form.handleSubmit(async (values) => {
  busy.value = true;
  error.value = null;
  const endsAt = localDayStart(values.endsOn);
  endsAt.setDate(endsAt.getDate() + 1);
  try {
    const created = await api<DiagnosticAssignmentDetailDto>('/diagnostic-assignments', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        questionnaireId: values.questionnaireId,
        measurementType: values.measurementType,
        versionId: values.measurementType === MeasurementType.PRIMARY ? null : values.versionId,
        groupId: values.targetKind === 'group' ? values.groupId : null,
        studentId: values.targetKind === 'student' ? values.studentId : null,
        startsAt: localDayStart(values.startsOn).toISOString(),
        endsAt: endsAt.toISOString(),
      },
    });
    emit('created', created);
    visible.value = false;
  } catch (caught) {
    if (caught instanceof ApiError) {
      form.setErrors(caught.fields);
      if (caught.fields.target) form.setFieldError('groupId', caught.fields.target);
    }
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось назначить диагностику';
  } finally {
    busy.value = false;
  }
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Назначение диагностики"
    :style="{ width: '36rem' }"
    :breakpoints="{ '767px': '95vw' }"
  >
    <form class="iot-form" novalidate @submit="submit">
      <Message v-if="loadError" severity="error" role="alert">{{ loadError }}</Message>
      <div class="iot-field">
        <label id="assign-questionnaire-label" for="assign-questionnaire">Методика</label>
        <Select
          v-model="questionnaireId"
          input-id="assign-questionnaire"
          aria-labelledby="assign-questionnaire-label"
          :options="published"
          option-label="title"
          option-value="id"
          placeholder="Выберите методику"
          empty-message="Нет опубликованных методик"
          :invalid="!!form.errors.value.questionnaireId"
          fluid
        />
        <small v-if="isPrimary" class="iot-field-hint">
          Первичный замер проводится по действующей (опубликованной) версии.
        </small>
        <small v-if="form.errors.value.questionnaireId" class="iot-field-error">
          {{ form.errors.value.questionnaireId }}
        </small>
      </div>
      <div class="iot-field">
        <label id="assign-measurement-label" for="assign-measurement">Замер</label>
        <Select
          v-model="measurementType"
          input-id="assign-measurement"
          aria-labelledby="assign-measurement-label"
          :options="measurementTypes"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <div v-if="!isPrimary && questionnaireId" class="iot-field">
        <label id="assign-version-label" for="assign-version">Версия методики</label>
        <Select
          v-model="versionId"
          input-id="assign-version"
          aria-labelledby="assign-version-label"
          :options="versions"
          option-label="label"
          option-value="id"
          placeholder="Выберите версию"
          empty-message="Нет опубликованных версий"
          :invalid="!!form.errors.value.versionId"
          fluid
        />
        <small class="iot-field-hint">
          Для сравнения с первичным замером выберите ту же версию или версию, сопоставимость которой
          утвердил исследователь.
        </small>
        <small v-if="form.errors.value.versionId" class="iot-field-error">
          {{ form.errors.value.versionId }}
        </small>
      </div>
      <fieldset class="iot-field assign__target">
        <legend>Кому назначить</legend>
        <div class="assign__choice">
          <RadioButton v-model="targetKind" input-id="assign-kind-group" value="group" />
          <label for="assign-kind-group">Всей группе</label>
        </div>
        <div class="assign__choice">
          <RadioButton v-model="targetKind" input-id="assign-kind-student" value="student" />
          <label for="assign-kind-student">Одному студенту</label>
        </div>
      </fieldset>
      <div class="iot-field">
        <label id="assign-group-label" for="assign-group">Группа</label>
        <Select
          v-model="groupId"
          input-id="assign-group"
          aria-labelledby="assign-group-label"
          :options="groups"
          option-label="name"
          option-value="id"
          placeholder="Выберите группу"
          empty-message="Нет доступных групп"
          :invalid="!!form.errors.value.groupId"
          fluid
        />
        <small v-if="form.errors.value.groupId" class="iot-field-error">
          {{ form.errors.value.groupId }}
        </small>
      </div>
      <div v-if="targetKind === 'student'" class="iot-field">
        <label id="assign-student-label" for="assign-student">Студент</label>
        <Select
          v-model="studentId"
          input-id="assign-student"
          aria-labelledby="assign-student-label"
          :options="students"
          option-label="label"
          option-value="id"
          :placeholder="groupId ? 'Выберите студента' : 'Сначала выберите группу'"
          empty-message="В группе нет студентов"
          filter
          :invalid="!!form.errors.value.studentId"
          fluid
        />
        <small v-if="form.errors.value.studentId" class="iot-field-error">
          {{ form.errors.value.studentId }}
        </small>
      </div>
      <div class="assign__period">
        <div class="iot-field">
          <label for="assign-starts">Начало</label>
          <InputText
            id="assign-starts"
            v-model="startsOn"
            v-bind="startsOnAttrs"
            type="date"
            :invalid="!!form.errors.value.startsOn"
            fluid
          />
          <small v-if="form.errors.value.startsOn" class="iot-field-error">
            {{ form.errors.value.startsOn }}
          </small>
        </div>
        <div class="iot-field">
          <label for="assign-ends">Окончание (включительно)</label>
          <InputText
            id="assign-ends"
            v-model="endsOn"
            v-bind="endsOnAttrs"
            type="date"
            :invalid="!!form.errors.value.endsOn"
            fluid
          />
          <small v-if="form.errors.value.endsOn" class="iot-field-error">
            {{ form.errors.value.endsOn }}
          </small>
        </div>
      </div>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" @click="visible = false" />
        <Button type="submit" label="Назначить" icon="pi pi-send" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.assign__target {
  margin: 0;
  padding: 0;
  border: 0;
}

.assign__target legend {
  margin-bottom: var(--iot-space-1);
  font-weight: 600;
}

.assign__choice {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.assign__period {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: var(--iot-space-3);
}
</style>
