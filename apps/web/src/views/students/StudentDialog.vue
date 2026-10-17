<script setup lang="ts">
import {
  formatFullName,
  type GroupDto,
  Permission,
  type StudentDetailsDto,
  studentEditFormSchema,
  transferFormSchema,
} from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import ErrorState from '@/components/ErrorState.vue';
import TemporaryPassword from '@/components/TemporaryPassword.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';
import StudentCard from './StudentCard.vue';

/**
 * Карточка студента (FR-009): показатели, история групп (FR-010) и действия — изменение ФИО,
 * перевод, архивирование (FR-011), новый временный пароль. Полный профиль — этап 05.
 */
const props = defineProps<{ studentId: string | null; groups: GroupDto[] }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ changed: [] }>();

const auth = useAuthStore();
const canManage = computed(() => auth.hasPermission(Permission.STUDENTS_MANAGE));
const student = ref<StudentDetailsDto | null>(null);
const loadError = ref<string | null>(null);
const mode = ref<'view' | 'edit' | 'transfer'>('view');
const actionError = ref<string | null>(null);
const busy = ref(false);
const archiveOpen = ref(false);
const resetOpen = ref(false);
const temporaryPassword = ref<string | null>(null);

const editForm = useForm({ validationSchema: toTypedSchema(studentEditFormSchema) });
const [lastName, lastNameAttrs] = editForm.defineField('lastName');
const [firstName, firstNameAttrs] = editForm.defineField('firstName');
const [middleName, middleNameAttrs] = editForm.defineField('middleName');
const editFields = [
  { id: 'lastName', label: 'Фамилия', model: lastName, attrs: lastNameAttrs },
  { id: 'firstName', label: 'Имя', model: firstName, attrs: firstNameAttrs },
  { id: 'middleName', label: 'Отчество (если есть)', model: middleName, attrs: middleNameAttrs },
] as const;
const transferForm = useForm({ validationSchema: toTypedSchema(transferFormSchema) });
const [targetGroup] = transferForm.defineField('groupId');
const [reason, reasonAttrs] = transferForm.defineField('reason');

const targetGroups = computed(() =>
  props.groups.filter((group) => group.id !== student.value?.group?.id),
);

async function load(): Promise<void> {
  if (!props.studentId) return;
  loadError.value = null;
  try {
    student.value = await api<StudentDetailsDto>(`/students/${props.studentId}`);
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить карточку';
  }
}

watch(visible, (open) => {
  if (!open) return;
  student.value = null;
  mode.value = 'view';
  actionError.value = null;
  temporaryPassword.value = null;
  void load();
});

function startEdit(): void {
  if (!student.value) return;
  editForm.resetForm({
    values: {
      lastName: student.value.lastName,
      firstName: student.value.firstName,
      middleName: student.value.middleName ?? '',
    },
  });
  actionError.value = null;
  mode.value = 'edit';
}

function startTransfer(): void {
  transferForm.resetForm({ values: { groupId: '', reason: '' } });
  actionError.value = null;
  mode.value = 'transfer';
}

async function run(
  action: () => Promise<StudentDetailsDto>,
  onFieldErrors?: (fields: Record<string, string>) => void,
): Promise<boolean> {
  busy.value = true;
  actionError.value = null;
  try {
    student.value = await action();
    mode.value = 'view';
    emit('changed');
    return true;
  } catch (error) {
    if (error instanceof ApiError) onFieldErrors?.(error.fields);
    actionError.value = error instanceof ApiError ? error.message : 'Не удалось выполнить действие';
    return false;
  } finally {
    busy.value = false;
  }
}

const saveEdit = editForm.handleSubmit((values) =>
  run(
    () =>
      api<StudentDetailsDto>(`/students/${props.studentId}`, {
        method: 'PATCH',
        body: { ...values, middleName: values.middleName || null },
      }),
    (fields) => editForm.setErrors(fields),
  ),
);

const saveTransfer = transferForm.handleSubmit((values) =>
  run(
    () =>
      api<StudentDetailsDto>(`/students/${props.studentId}/transfer`, {
        method: 'POST',
        body: values,
      }),
    (fields) => transferForm.setErrors(fields),
  ),
);

async function archive(reasonText: string): Promise<void> {
  const ok = await run(() =>
    api<StudentDetailsDto>(`/students/${props.studentId}/archive`, {
      method: 'POST',
      body: { reason: reasonText },
    }),
  );
  if (ok) archiveOpen.value = false;
}

function restore(): void {
  void run(() =>
    api<StudentDetailsDto>(`/students/${props.studentId}/restore`, { method: 'POST' }),
  );
}

async function resetPassword(): Promise<void> {
  busy.value = true;
  actionError.value = null;
  try {
    const result = await api<{ login: string; temporaryPassword: string }>(
      `/students/${props.studentId}/reset-password`,
      { method: 'POST' },
    );
    temporaryPassword.value = result.temporaryPassword;
    resetOpen.value = false;
  } catch (error) {
    actionError.value = error instanceof ApiError ? error.message : 'Не удалось сбросить пароль';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="student ? formatFullName(student) : 'Карточка студента'"
    :style="{ width: '44rem' }"
    :breakpoints="{ '767px': '95vw' }"
  >
    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="!student" role="status">Загрузка…</p>
    <div v-else class="iot-form">
      <StudentCard :student="student" class="student-dialog__card" />

      <section aria-labelledby="student-history">
        <h3 id="student-history" class="student-dialog__heading">История групп</h3>
        <ul class="student-dialog__history">
          <li v-for="item in student.enrollments" :key="item.id">
            <strong>{{ item.group.name }}</strong>
            <span>
              с {{ formatDateTime(item.startsAt) }}
              {{ item.endsAt ? `по ${formatDateTime(item.endsAt)}` : '— по настоящее время' }}
            </span>
            <span v-if="item.reason" class="student-dialog__muted">Причина: {{ item.reason }}</span>
          </li>
        </ul>
      </section>

      <Message v-if="student.archivedAt" severity="secondary">
        В архиве с {{ formatDateTime(student.archivedAt) }}. Причина: {{ student.archiveReason }}.
        Данные сохранены, вход в систему закрыт.
      </Message>
      <p class="student-dialog__muted">
        Логин: {{ student.login ?? 'нет учётной записи' }}. Добавлен
        {{ formatDateTime(student.createdAt) }}.
      </p>

      <TemporaryPassword v-if="temporaryPassword" :password="temporaryPassword" />
      <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>

      <form v-if="mode === 'edit'" class="iot-form" novalidate @submit="saveEdit">
        <h3 class="student-dialog__heading">Изменение ФИО</h3>
        <div v-for="field in editFields" :key="field.id" class="iot-field">
          <label :for="`edit-student-${field.id}`">{{ field.label }}</label>
          <InputText
            :id="`edit-student-${field.id}`"
            v-model="field.model.value"
            v-bind="field.attrs.value"
            :invalid="!!editForm.errors.value[field.id]"
            fluid
          />
          <small v-if="editForm.errors.value[field.id]" class="iot-field-error">
            {{ editForm.errors.value[field.id] }}
          </small>
        </div>
        <div class="iot-form-buttons">
          <Button type="button" label="Отмена" severity="secondary" text @click="mode = 'view'" />
          <Button type="submit" label="Сохранить" :loading="busy" />
        </div>
      </form>

      <form v-else-if="mode === 'transfer'" class="iot-form" novalidate @submit="saveTransfer">
        <h3 class="student-dialog__heading">Перевод в другую группу</h3>
        <p class="student-dialog__muted">
          История сохранится: прежняя группа останется в карточке с датой окончания.
        </p>
        <div class="iot-field">
          <label for="transfer-group">Новая группа</label>
          <Select
            v-model="targetGroup"
            input-id="transfer-group"
            :options="targetGroups"
            option-label="name"
            option-value="id"
            placeholder="Выберите группу"
            empty-message="Нет других доступных групп"
            :invalid="!!transferForm.errors.value.groupId"
            fluid
          />
          <small v-if="transferForm.errors.value.groupId" class="iot-field-error">
            {{ transferForm.errors.value.groupId }}
          </small>
        </div>
        <div class="iot-field">
          <label for="transfer-reason">Причина перевода</label>
          <Textarea
            id="transfer-reason"
            v-model="reason"
            v-bind="reasonAttrs"
            rows="2"
            maxlength="500"
            :invalid="!!transferForm.errors.value.reason"
            fluid
          />
          <small v-if="transferForm.errors.value.reason" class="iot-field-error">
            {{ transferForm.errors.value.reason }}
          </small>
        </div>
        <div class="iot-form-buttons">
          <Button type="button" label="Отмена" severity="secondary" text @click="mode = 'view'" />
          <Button type="submit" label="Перевести" :loading="busy" />
        </div>
      </form>

      <div v-else-if="canManage" class="iot-form-buttons">
        <template v-if="student.archivedAt">
          <Button label="Вернуть из архива" icon="pi pi-replay" :loading="busy" @click="restore" />
        </template>
        <template v-else>
          <Button
            label="Изменить ФИО"
            icon="pi pi-pencil"
            severity="secondary"
            outlined
            @click="startEdit"
          />
          <Button
            label="Перевести"
            icon="pi pi-arrow-right-arrow-left"
            severity="secondary"
            outlined
            @click="startTransfer"
          />
          <Button
            label="Новый пароль"
            icon="pi pi-key"
            severity="secondary"
            outlined
            @click="resetOpen = true"
          />
          <Button
            label="В архив"
            icon="pi pi-box"
            severity="danger"
            outlined
            @click="archiveOpen = true"
          />
        </template>
      </div>
    </div>

    <ActionDialog
      v-model:visible="archiveOpen"
      title="Архивирование студента"
      message="Студент исчезнет из рабочих списков, вход в систему будет закрыт. Все данные, включая исследовательские, сохранятся. Студента можно вернуть из архива."
      confirm-label="В архив"
      require-reason
      danger
      :busy="busy"
      :error="actionError"
      @confirm="archive"
    />
    <ActionDialog
      v-model:visible="resetOpen"
      title="Новый временный пароль"
      message="Текущий пароль студента перестанет действовать, все его сессии завершатся. При входе с новым паролем система попросит задать свой."
      confirm-label="Выдать пароль"
      :busy="busy"
      :error="actionError"
      @confirm="resetPassword"
    />
  </Dialog>
</template>

<style scoped>
.student-dialog__card {
  box-shadow: none;
}

.student-dialog__heading {
  margin: 0 0 var(--iot-space-2);
  color: var(--iot-color-heading);
  font-size: 1rem;
}

.student-dialog__history {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.student-dialog__history li {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--iot-space-2);
}

.student-dialog__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
