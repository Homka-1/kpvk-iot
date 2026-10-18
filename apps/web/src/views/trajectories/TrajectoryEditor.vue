<script setup lang="ts">
import {
  DIFFICULTY_LEVEL_LABELS,
  MATERIAL_KIND_LABELS,
  Permission,
  STAGE_ASSIGNMENTS_MAX,
  STAGE_CHECKPOINTS_MAX,
  STAGE_MATERIALS_MAX,
  type StageAssignmentDto,
  type StageMaterialDto,
  TRAJECTORY_REASON_MAX,
  TRAJECTORY_STAGES_MAX,
  trajectoryDiff,
  type TrajectoryDto,
  trajectoryIssues,
} from '@iot/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { computed, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import DateInput from '@/components/DateInput.vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import {
  assignmentRemovable,
  checkpointRemovable,
  formStages,
  newKey,
  stageRemovable,
  STEPS,
  type StageForm,
  toContent,
  toForm,
  type TrajectoryForm,
} from './content';
import VersionChanges from './VersionChanges.vue';
import LibraryPickerDialog from './LibraryPickerDialog.vue';
import StageMap from './StageMap.vue';
import StepsHeader from './StepsHeader.vue';
import TrajectoryPassport from './TrajectoryPassport.vue';

/**
 * Конструктор ИОТ, шаги 2–7 (UC-03; FR-036–FR-039): цели, этапы, задания и материалы
 * библиотеки, сроки и контрольные точки, формы поддержки, предварительный просмотр и
 * «Утвердить и назначить». Черновик сохраняется при переходе между шагами; проверки — то же
 * правило, что на сервере (`trajectoryIssues`); права и полноту окончательно проверяет сервер.
 *
 * Режим `correction` — корректировка утверждённого маршрута (UC-05, FR-043): изменения не
 * сохраняются по шагам, а применяются одной новой версией с причиной на последнем шаге; начатые
 * и выполненные задания и отмеченные контрольные точки убрать нельзя.
 */
const props = withDefaults(
  defineProps<{ trajectory: TrajectoryDto; mode?: 'draft' | 'correction' }>(),
  { mode: 'draft' },
);
const emit = defineEmits<{ updated: [trajectory: TrajectoryDto]; cancel: [] }>();
const correction = computed(() => props.mode === 'correction');
const auth = useAuthStore();
const router = useRouter();
const canApprove = computed(() => auth.hasPermission(Permission.TRAJECTORIES_APPROVE));

const saved = ref<TrajectoryDto>(props.trajectory);
const form = ref<TrajectoryForm>(toForm(props.trajectory));
const step = ref(1);
const busy = ref(false);
const message = ref<string | null>(null);
const errors = ref<Record<string, string>>({});
const savedJson = ref(JSON.stringify(toContent(form.value)));
const dirty = computed(() => JSON.stringify(toContent(form.value)) !== savedJson.value);

watch(
  () => props.trajectory,
  (next) => {
    saved.value = next;
    form.value = toForm(next);
    savedJson.value = JSON.stringify(toContent(form.value));
  },
);

onBeforeRouteLeave(() =>
  dirty.value ? window.confirm('Есть несохранённые изменения. Уйти без сохранения?') : true,
);

const preview = computed<TrajectoryDto>(() => {
  const content = toContent(form.value);
  return {
    ...saved.value,
    goals: content.goals ?? null,
    plannedResults: content.plannedResults ?? null,
    supportMethods: content.supportMethods ?? null,
    startDate: content.startDate ?? null,
    plannedEndDate: content.plannedEndDate ?? null,
    stages: formStages(form.value, saved.value),
  };
});
const approvalIssues = computed(() => trajectoryIssues(toContent(form.value), 'approve'));
const changes = computed(() =>
  correction.value ? trajectoryDiff(saved.value, preview.value) : [],
);

/** Шаг, на котором исправляется поле с путём `path`. */
function stepOf(path: string): number {
  if (/^stages\.\d+\.(startDate|endDate|checkpoints)/.test(path)) return 4;
  if (/^stages\.\d+\.assignments\.\d+\.dueAt/.test(path)) return 4;
  if (/^stages\.\d+\.(materialIds|assignments)/.test(path)) return 3;
  if (path.startsWith('stages')) return 2;
  if (path === 'supportMethods') return 5;
  return 1;
}

const error = (path: string) => errors.value[path];

async function save(): Promise<boolean> {
  message.value = null;
  const issues = trajectoryIssues(toContent(form.value), 'draft');
  if (issues.length > 0) {
    errors.value = Object.fromEntries(issues.map((issue) => [issue.path, issue.message]));
    message.value = 'Проверьте отмеченные поля';
    return false;
  }
  // Корректировка применяется целиком на последнем шаге — новой версией с причиной.
  if (correction.value) {
    errors.value = {};
    return true;
  }
  if (!dirty.value) return true;
  busy.value = true;
  try {
    const next = await api<TrajectoryDto>(`/trajectories/${saved.value.id}`, {
      method: 'PUT',
      body: { updatedAt: saved.value.updatedAt, ...toContent(form.value) },
    });
    errors.value = {};
    saved.value = next;
    form.value = toForm(next);
    savedJson.value = JSON.stringify(toContent(form.value));
    return true;
  } catch (caught) {
    if (caught instanceof ApiError) {
      errors.value = caught.fields;
      message.value = caught.message;
    } else {
      message.value = 'Не удалось сохранить черновик. Повторите попытку';
    }
    return false;
  } finally {
    busy.value = false;
  }
}

async function go(target: number): Promise<void> {
  if (target < 1 || target >= STEPS.length) return;
  if (await save()) step.value = target;
}

// ── Этапы ──

function addStage(): void {
  form.value.stages.push({
    key: newKey(),
    id: null,
    title: '',
    goal: '',
    description: '',
    plannedResults: '',
    startDate: '',
    endDate: '',
    checkpoints: [],
    materials: [],
    assignments: [],
  });
}

const lockedHint = 'Студент уже работал над этим — убрать нельзя';

function moveStage(index: number, delta: number): void {
  const stages = form.value.stages;
  const [stage] = stages.splice(index, 1);
  stages.splice(index + delta, 0, stage!);
}

function removeStage(index: number): void {
  const stage = form.value.stages[index]!;
  const filled = stage.materials.length + stage.assignments.length + stage.checkpoints.length > 0;
  if (filled && !window.confirm(`Удалить этап «${stage.title}» вместе с заданиями и точками?`)) {
    return;
  }
  form.value.stages.splice(index, 1);
}

// ── Материалы и задания ──

const picker = ref<{ kind: 'materials' | 'assignments'; stage: StageForm } | null>(null);
const pickerOpen = ref(false);
function openPicker(kind: 'materials' | 'assignments', stage: StageForm): void {
  picker.value = { kind, stage };
  pickerOpen.value = true;
}
const pickerSelected = computed(() =>
  !picker.value
    ? []
    : picker.value.kind === 'materials'
      ? picker.value.stage.materials.map((item) => item.id)
      : picker.value.stage.assignments.map((item) => item.assignment.id),
);
function pickMaterials(items: StageMaterialDto[]): void {
  picker.value?.stage.materials.push(...items);
}
function pickAssignments(items: StageAssignmentDto['assignment'][]): void {
  picker.value?.stage.assignments.push(
    ...items.map((assignment) => ({
      key: newKey(),
      id: null,
      assignment,
      dueDate: picker.value!.stage.endDate,
      status: null,
    })),
  );
}

function addCheckpoint(stage: StageForm): void {
  stage.checkpoints.push({
    key: newKey(),
    id: null,
    title: `Контрольная точка этапа «${stage.title}»`,
    description: '',
    dueDate: stage.endDate,
    status: null,
  });
}

// ── Действия ──

const confirmApprove = ref(false);
const confirmArchive = ref(false);
const actionError = ref<string | null>(null);

async function act(
  path: 'approve' | 'submit' | 'archive',
  body: Record<string, unknown> = {},
): Promise<void> {
  actionError.value = null;
  if (!(await save())) {
    actionError.value = message.value;
    return;
  }
  busy.value = true;
  try {
    const next = await api<TrajectoryDto>(`/trajectories/${saved.value.id}/${path}`, {
      method: 'POST',
      body: { updatedAt: saved.value.updatedAt, ...body },
    });
    confirmApprove.value = false;
    confirmArchive.value = false;
    savedJson.value = JSON.stringify(toContent(toForm(next)));
    if (path === 'archive') {
      form.value = toForm(next);
      await router.push(`/students/${next.student.id}?tab=trajectory`);
      return;
    }
    emit('updated', next);
  } catch (caught) {
    if (caught instanceof ApiError) {
      errors.value = caught.fields;
      actionError.value = caught.message;
    } else {
      actionError.value = 'Не удалось выполнить действие. Повторите попытку';
    }
  } finally {
    busy.value = false;
  }
}

function archive(reason: string): Promise<void> {
  return act('archive', { reason });
}

// ── Корректировка (UC-05) ──

const reason = ref('');
const confirmCorrection = ref(false);

function askCorrection(): void {
  actionError.value = null;
  if (!reason.value.trim()) {
    errors.value = { ...errors.value, reason: 'Укажите причину корректировки' };
    return;
  }
  confirmCorrection.value = true;
}

async function correct(): Promise<void> {
  busy.value = true;
  actionError.value = null;
  try {
    const next = await api<TrajectoryDto>(`/trajectories/${saved.value.id}/corrections`, {
      method: 'POST',
      body: {
        updatedAt: saved.value.updatedAt,
        reason: reason.value.trim(),
        ...toContent(form.value),
      },
    });
    confirmCorrection.value = false;
    savedJson.value = JSON.stringify(toContent(toForm(next)));
    form.value = toForm(next);
    emit('updated', next);
  } catch (caught) {
    confirmCorrection.value = false;
    if (caught instanceof ApiError) {
      errors.value = caught.fields;
      actionError.value = caught.message;
    } else {
      actionError.value = 'Не удалось сохранить корректировку. Повторите попытку';
    }
  } finally {
    busy.value = false;
  }
}

function cancelCorrection(): void {
  if (dirty.value && !window.confirm('Отменить корректировку? Изменения не сохранятся.')) return;
  savedJson.value = JSON.stringify(toContent(form.value));
  emit('cancel');
}
</script>

<template>
  <div class="editor">
    <StepsHeader :current="step" @select="go" />
    <Message v-if="message" severity="error" role="alert">{{ message }}</Message>

    <!-- ② Цели -->
    <section v-if="step === 1" class="iot-card iot-form" aria-labelledby="step-goals">
      <h2 id="step-goals">② Цели и сроки маршрута</h2>
      <div class="iot-field">
        <label for="t-goals">Образовательные цели</label>
        <Textarea id="t-goals" v-model="form.goals" rows="3" :invalid="!!error('goals')" fluid />
        <small v-if="error('goals')" class="iot-field-error">{{ error('goals') }}</small>
      </div>
      <div class="iot-field">
        <label for="t-results">Планируемые результаты</label>
        <Textarea id="t-results" v-model="form.plannedResults" rows="3" fluid />
      </div>
      <div class="editor__pair">
        <div class="iot-field">
          <label for="t-start">Дата начала</label>
          <DateInput
            v-model="form.startDate"
            input-id="t-start"
            :invalid="!!error('startDate')"
            fluid
          />
          <small v-if="error('startDate')" class="iot-field-error">{{ error('startDate') }}</small>
        </div>
        <div class="iot-field">
          <label for="t-end">Планируемая дата завершения</label>
          <DateInput
            v-model="form.plannedEndDate"
            input-id="t-end"
            :invalid="!!error('plannedEndDate')"
            fluid
          />
          <small v-if="error('plannedEndDate')" class="iot-field-error">
            {{ error('plannedEndDate') }}
          </small>
        </div>
      </div>
    </section>

    <!-- ③ Этапы -->
    <section v-if="step === 2" class="editor__section" aria-labelledby="step-stages">
      <h2 id="step-stages">③ Этапы маршрута</h2>
      <p class="editor__muted">
        Стандартно пять этапов (п. 4.6). Преподаватель адаптирует их порядок, содержание и
        результаты.
      </p>
      <article
        v-for="(stage, index) in form.stages"
        :key="stage.key"
        class="iot-card iot-form editor__stage"
        :aria-label="`Этап ${index + 1}`"
      >
        <div class="editor__stage-head">
          <span class="editor__number" aria-hidden="true">{{ index + 1 }}</span>
          <div class="iot-field editor__grow">
            <label :for="`s-${stage.key}-title`">Название этапа {{ index + 1 }}</label>
            <InputText
              :id="`s-${stage.key}-title`"
              v-model="stage.title"
              :invalid="!!error(`stages.${index}.title`)"
              fluid
            />
            <small v-if="error(`stages.${index}.title`)" class="iot-field-error">
              {{ error(`stages.${index}.title`) }}
            </small>
          </div>
          <div class="editor__stage-actions">
            <Button
              icon="pi pi-arrow-up"
              severity="secondary"
              text
              :disabled="index === 0"
              :aria-label="`Переместить этап ${index + 1} выше`"
              @click="moveStage(index, -1)"
            />
            <Button
              icon="pi pi-arrow-down"
              severity="secondary"
              text
              :disabled="index === form.stages.length - 1"
              :aria-label="`Переместить этап ${index + 1} ниже`"
              @click="moveStage(index, 1)"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              :disabled="correction && !stageRemovable(stage)"
              :title="correction && !stageRemovable(stage) ? lockedHint : undefined"
              :aria-label="`Удалить этап ${index + 1}`"
              @click="removeStage(index)"
            />
          </div>
        </div>
        <div class="iot-field">
          <label :for="`s-${stage.key}-goal`">Цель этапа</label>
          <Textarea
            :id="`s-${stage.key}-goal`"
            v-model="stage.goal"
            rows="2"
            :invalid="!!error(`stages.${index}.goal`)"
            fluid
          />
          <small v-if="error(`stages.${index}.goal`)" class="iot-field-error">
            {{ error(`stages.${index}.goal`) }}
          </small>
        </div>
        <div class="iot-field">
          <label :for="`s-${stage.key}-description`">Содержание</label>
          <Textarea :id="`s-${stage.key}-description`" v-model="stage.description" rows="2" fluid />
        </div>
        <div class="iot-field">
          <label :for="`s-${stage.key}-results`">Планируемые результаты этапа</label>
          <Textarea :id="`s-${stage.key}-results`" v-model="stage.plannedResults" rows="2" fluid />
        </div>
      </article>
      <small v-if="error('stages')" class="iot-field-error">{{ error('stages') }}</small>
      <div>
        <Button
          label="Добавить этап"
          icon="pi pi-plus"
          outlined
          :disabled="form.stages.length >= TRAJECTORY_STAGES_MAX"
          @click="addStage"
        />
      </div>
    </section>

    <!-- ④ Задания и материалы -->
    <section v-if="step === 3" class="editor__section" aria-labelledby="step-library">
      <h2 id="step-library">④ Задания и материалы этапов</h2>
      <Message severity="info" :closable="false">
        Задания и материалы берутся из библиотеки дисциплины «{{ saved.discipline.name }}».
        Мотивационный профиль сложность заданий не ограничивает.
      </Message>
      <p v-if="form.stages.length === 0" class="editor__muted">Сначала добавьте этапы.</p>
      <article
        v-for="(stage, index) in form.stages"
        :key="stage.key"
        class="iot-card editor__stage"
        :aria-label="`Этап ${index + 1}: задания и материалы`"
      >
        <h3>{{ index + 1 }}. {{ stage.title || 'Без названия' }}</h3>
        <h4>Материалы</h4>
        <ul v-if="stage.materials.length" class="editor__rows">
          <li v-for="(material, item) in stage.materials" :key="material.id">
            <span>
              {{ material.title }}
              <span class="editor__muted">· {{ MATERIAL_KIND_LABELS[material.kind] }}</span>
              <StatusBadge
                v-if="material.archived"
                label="В архиве"
                tone="neutral"
                icon="pi pi-box"
              />
            </span>
            <small v-if="error(`stages.${index}.materialIds.${item}`)" class="iot-field-error">
              {{ error(`stages.${index}.materialIds.${item}`) }}
            </small>
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              :aria-label="`Убрать материал «${material.title}»`"
              @click="stage.materials.splice(item, 1)"
            />
          </li>
        </ul>
        <p v-else class="editor__muted">Материалы не назначены</p>
        <Button
          label="Добавить материалы"
          icon="pi pi-book"
          size="small"
          outlined
          :disabled="stage.materials.length >= STAGE_MATERIALS_MAX"
          @click="openPicker('materials', stage)"
        />
        <h4>Задания</h4>
        <ul v-if="stage.assignments.length" class="editor__rows">
          <li v-for="(item, position) in stage.assignments" :key="item.key">
            <span>
              {{ item.assignment.title }}
              <span class="editor__muted">
                · {{ item.assignment.typeName }} · сложность:
                {{ DIFFICULTY_LEVEL_LABELS[item.assignment.difficulty].toLowerCase() }}
              </span>
              <StatusBadge
                v-if="item.assignment.archived"
                label="В архиве"
                tone="neutral"
                icon="pi pi-box"
              />
            </span>
            <small
              v-if="error(`stages.${index}.assignments.${position}.assignmentId`)"
              class="iot-field-error"
            >
              {{ error(`stages.${index}.assignments.${position}.assignmentId`) }}
            </small>
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              :disabled="correction && !assignmentRemovable(item)"
              :title="correction && !assignmentRemovable(item) ? lockedHint : undefined"
              :aria-label="`Убрать задание «${item.assignment.title}»`"
              @click="stage.assignments.splice(position, 1)"
            />
          </li>
        </ul>
        <p v-else class="editor__muted">Задания не назначены</p>
        <small v-if="error(`stages.${index}.assignments`)" class="iot-field-error">
          {{ error(`stages.${index}.assignments`) }}
        </small>
        <Button
          label="Добавить задания"
          icon="pi pi-file-edit"
          size="small"
          outlined
          :disabled="stage.assignments.length >= STAGE_ASSIGNMENTS_MAX"
          @click="openPicker('assignments', stage)"
        />
      </article>
    </section>

    <!-- ⑤ Сроки и контрольные точки -->
    <section v-if="step === 4" class="editor__section" aria-labelledby="step-dates">
      <h2 id="step-dates">⑤ Сроки и контрольные точки</h2>
      <p class="editor__muted">
        Маршрут: {{ form.startDate || '—' }} – {{ form.plannedEndDate || '—' }}. Этапы идут
        последовательно и не выходят за сроки маршрута.
      </p>
      <article
        v-for="(stage, index) in form.stages"
        :key="stage.key"
        class="iot-card iot-form editor__stage"
        :aria-label="`Этап ${index + 1}: сроки`"
      >
        <h3>{{ index + 1 }}. {{ stage.title || 'Без названия' }}</h3>
        <div class="editor__pair">
          <div class="iot-field">
            <label :for="`s-${stage.key}-start`">Начало этапа</label>
            <DateInput
              v-model="stage.startDate"
              :input-id="`s-${stage.key}-start`"
              :invalid="!!error(`stages.${index}.startDate`)"
              fluid
            />
            <small v-if="error(`stages.${index}.startDate`)" class="iot-field-error">
              {{ error(`stages.${index}.startDate`) }}
            </small>
          </div>
          <div class="iot-field">
            <label :for="`s-${stage.key}-end`">Окончание этапа</label>
            <DateInput
              v-model="stage.endDate"
              :input-id="`s-${stage.key}-end`"
              :invalid="!!error(`stages.${index}.endDate`)"
              fluid
            />
            <small v-if="error(`stages.${index}.endDate`)" class="iot-field-error">
              {{ error(`stages.${index}.endDate`) }}
            </small>
          </div>
        </div>

        <h4>Контрольные точки</h4>
        <div
          v-for="(checkpoint, item) in stage.checkpoints"
          :key="checkpoint.key"
          class="editor__checkpoint"
        >
          <div class="iot-field editor__grow">
            <label :for="`c-${checkpoint.key}-title`">Название</label>
            <InputText
              :id="`c-${checkpoint.key}-title`"
              v-model="checkpoint.title"
              :invalid="!!error(`stages.${index}.checkpoints.${item}.title`)"
              fluid
            />
            <small
              v-if="error(`stages.${index}.checkpoints.${item}.title`)"
              class="iot-field-error"
            >
              {{ error(`stages.${index}.checkpoints.${item}.title`) }}
            </small>
          </div>
          <div class="iot-field">
            <label :for="`c-${checkpoint.key}-date`">Дата</label>
            <DateInput
              v-model="checkpoint.dueDate"
              :input-id="`c-${checkpoint.key}-date`"
              :invalid="!!error(`stages.${index}.checkpoints.${item}.dueDate`)"
              fluid
            />
            <small
              v-if="error(`stages.${index}.checkpoints.${item}.dueDate`)"
              class="iot-field-error"
            >
              {{ error(`stages.${index}.checkpoints.${item}.dueDate`) }}
            </small>
          </div>
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            :disabled="correction && !checkpointRemovable(checkpoint)"
            :title="
              correction && !checkpointRemovable(checkpoint) ? 'Точка уже отмечена' : undefined
            "
            :aria-label="`Удалить контрольную точку «${checkpoint.title}»`"
            @click="stage.checkpoints.splice(item, 1)"
          />
        </div>
        <small v-if="error(`stages.${index}.checkpoints`)" class="iot-field-error">
          {{ error(`stages.${index}.checkpoints`) }}
        </small>
        <div>
          <Button
            label="Добавить контрольную точку"
            icon="pi pi-flag"
            size="small"
            outlined
            :disabled="stage.checkpoints.length >= STAGE_CHECKPOINTS_MAX"
            @click="addCheckpoint(stage)"
          />
        </div>

        <template v-if="stage.assignments.length">
          <h4>Сроки заданий</h4>
          <div
            v-for="(item, position) in stage.assignments"
            :key="item.key"
            class="iot-field editor__due"
          >
            <label :for="`a-${item.key}-due`">{{ item.assignment.title }}</label>
            <DateInput
              v-model="item.dueDate"
              :input-id="`a-${item.key}-due`"
              :invalid="!!error(`stages.${index}.assignments.${position}.dueAt`)"
            />
            <small
              v-if="error(`stages.${index}.assignments.${position}.dueAt`)"
              class="iot-field-error"
            >
              {{ error(`stages.${index}.assignments.${position}.dueAt`) }}
            </small>
          </div>
        </template>
      </article>
    </section>

    <!-- ⑥ Сопровождение -->
    <section v-if="step === 5" class="iot-card iot-form" aria-labelledby="step-support">
      <h2 id="step-support">⑥ Формы поддержки и сопровождения</h2>
      <p class="editor__muted">
        Заполнено по стратегии утверждённого мотивационного профиля (п. 4.5), если он есть.
        Преподаватель дополняет и изменяет текст.
      </p>
      <div class="iot-field">
        <label for="t-support">Способы сопровождения</label>
        <Textarea id="t-support" v-model="form.supportMethods" rows="6" fluid />
      </div>
    </section>

    <!-- ⑦ Предпросмотр -->
    <section v-if="step === 6" class="editor__section" aria-labelledby="step-preview">
      <h2 id="step-preview">⑦ Предварительный просмотр</h2>
      <TrajectoryPassport :trajectory="preview" />
      <StageMap
        :stages="preview.stages"
        :support-methods="preview.supportMethods"
        :progress="false"
      />
      <Message v-if="approvalIssues.length" severity="warn" :closable="false">
        <p class="editor__issues-title">Перед утверждением заполните:</p>
        <ul class="editor__issues">
          <li v-for="issue in approvalIssues" :key="issue.path">
            <button type="button" class="editor__link" @click="go(stepOf(issue.path))">
              {{ issue.message }}
            </button>
          </li>
        </ul>
      </Message>
      <Message v-else-if="!correction" severity="success" :closable="false">
        Маршрут заполнен. После утверждения он станет активным и появится в кабинете студента.
      </Message>
      <template v-if="correction">
        <section class="iot-card iot-form" aria-labelledby="correction-title">
          <h3 id="correction-title">Изменения новой версии {{ saved.version + 1 }}</h3>
          <VersionChanges :changes="changes" />
          <div class="iot-field">
            <label for="t-reason">Причина корректировки</label>
            <Textarea
              id="t-reason"
              v-model="reason"
              rows="3"
              :maxlength="TRAJECTORY_REASON_MAX"
              :invalid="!!error('reason')"
              fluid
            />
            <small v-if="error('reason')" class="iot-field-error">{{ error('reason') }}</small>
            <small v-else class="editor__muted">
              Сохраняется в истории версий. Студент получит уведомление о новой версии.
            </small>
          </div>
          <small v-if="error('stages')" class="iot-field-error">{{ error('stages') }}</small>
        </section>
        <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>
        <div class="editor__actions">
          <Button
            label="Подтвердить новую версию"
            icon="pi pi-check"
            :disabled="approvalIssues.length > 0 || changes.length === 0"
            :loading="busy"
            @click="askCorrection"
          />
          <Button
            label="Отменить корректировку"
            icon="pi pi-times"
            severity="secondary"
            text
            @click="cancelCorrection"
          />
        </div>
      </template>
      <Message v-if="actionError && !correction" severity="error" role="alert">
        {{ actionError }}
      </Message>
      <div v-if="!correction" class="editor__actions">
        <Button
          v-if="canApprove"
          label="Утвердить и назначить"
          icon="pi pi-check"
          :disabled="approvalIssues.length > 0"
          :loading="busy"
          @click="confirmApprove = true"
        />
        <Button
          label="Отправить на согласование"
          icon="pi pi-send"
          :outlined="canApprove"
          :disabled="approvalIssues.length > 0"
          :loading="busy"
          @click="act('submit')"
        />
        <Button
          label="В архив"
          icon="pi pi-box"
          severity="secondary"
          text
          @click="confirmArchive = true"
        />
      </div>
      <p v-if="!canApprove && !correction" class="editor__muted">
        Утверждает преподаватель с правом «Утверждение ИОТ»: отправьте маршрут на согласование.
      </p>
    </section>

    <div class="editor__nav">
      <Button
        label="Назад"
        icon="pi pi-arrow-left"
        severity="secondary"
        outlined
        :disabled="step === 1 || busy"
        @click="go(step - 1)"
      />
      <Button
        v-if="!correction"
        label="Сохранить черновик"
        icon="pi pi-save"
        severity="secondary"
        :loading="busy"
        :disabled="!dirty"
        @click="save"
      />
      <Button
        v-if="step < STEPS.length - 1"
        label="Далее"
        icon="pi pi-arrow-right"
        icon-pos="right"
        :disabled="busy"
        @click="go(step + 1)"
      />
    </div>
    <p class="editor__muted" role="status">
      <template v-if="correction">
        Изменения применятся после подтверждения новой версии на шаге «Предпросмотр».
      </template>
      <template v-else>
        {{ dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены' }}
      </template>
    </p>

    <LibraryPickerDialog
      v-if="picker"
      v-model:visible="pickerOpen"
      :kind="picker.kind"
      :discipline-id="saved.discipline.id"
      :selected-ids="pickerSelected"
      @pick-materials="pickMaterials"
      @pick-assignments="pickAssignments"
    />
    <ActionDialog
      v-model:visible="confirmApprove"
      title="Утвердить и назначить ИОТ"
      :message="`Маршрут «${saved.discipline.name}» станет активным, задания этапов будут назначены, студент получит уведомление. Дальнейшие изменения — только корректировкой с новой версией.`"
      confirm-label="Утвердить и назначить"
      :busy="busy"
      :error="actionError"
      @confirm="act('approve')"
    />
    <ActionDialog
      v-model:visible="confirmCorrection"
      title="Подтвердить новую версию ИОТ"
      :message="`Будет утверждена версия ${saved.version + 1}. Прежняя версия сохранится в истории, студент получит уведомление.`"
      confirm-label="Подтвердить"
      :busy="busy"
      :error="actionError"
      @confirm="correct"
    />
    <ActionDialog
      v-model:visible="confirmArchive"
      title="Перенести черновик в архив"
      message="Черновик и его задания перестанут действовать. По этой дисциплине можно будет создать новую ИОТ."
      confirm-label="В архив"
      require-reason
      danger
      :busy="busy"
      :error="actionError"
      @confirm="archive"
    />
  </div>
</template>

<style scoped>
.editor,
.editor__section {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.editor h2 {
  margin: 0;
  font-size: 1.125rem;
}

.editor h3 {
  margin: 0;
  font-size: 1rem;
}

.editor h4 {
  margin: var(--iot-space-2) 0 0;
  font-size: 0.9375rem;
}

.editor__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.editor__pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: var(--iot-space-3);
}

.editor__stage {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.editor__stage-head,
.editor__checkpoint {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: flex-end;
}

.editor__grow {
  flex: 1 1 220px;
}

.editor__number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-bottom: 6px;
  border-radius: 50%;
  background: var(--iot-navy-700);
  color: var(--iot-color-on-primary);
  font-weight: 700;
}

.editor__stage-actions {
  display: flex;
}

.editor__rows {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.editor__rows li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
  align-items: center;
  justify-content: space-between;
}

.editor__due {
  max-width: 420px;
}

.editor__nav,
.editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.editor__issues-title {
  margin: 0 0 var(--iot-space-1);
}

.editor__issues {
  margin: 0;
  padding-left: var(--iot-space-4);
}

.editor__link {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
}
</style>
