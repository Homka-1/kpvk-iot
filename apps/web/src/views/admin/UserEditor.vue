<script setup lang="ts">
import {
  formatFullName,
  type Permission,
  ROLE_LABELS,
  type RoleCode,
  RoleCode as Roles,
  STAFF_ROLES,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import DatePicker from 'primevue/datepicker';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';
import ActionDialog from './ActionDialog.vue';
import TemporaryPassword from './TemporaryPassword.vue';
import {
  type PermissionInfo,
  type TemporaryPasswordResult,
  type UserDetails,
  userState,
} from './types';

/**
 * Карточка учётной записи: ФИО и e-mail, роли, блокировка, сброс пароля, индивидуальные
 * разрешения. Каждое действие сервер записывает в журнал аудита.
 */
const props = defineProps<{ userId: string | null; permissions: PermissionInfo[] }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ changed: [] }>();

const auth = useAuthStore();
const user = ref<UserDetails | null>(null);
const loadError = ref<string | null>(null);
const temporaryPassword = ref<string | null>(null);
const notice = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busy = ref(false);

const profile = reactive({ lastName: '', firstName: '', middleName: '', email: '' });
const profileErrors = ref<Record<string, string>>({});
const roles = ref<RoleCode[]>([]);
const grant = reactive<{ permission: Permission | null; reason: string; expiresAt: Date | null }>({
  permission: null,
  reason: '',
  expiresAt: null,
});
const grantErrors = ref<Record<string, string>>({});

type PendingAction = 'block' | 'reset' | { revoke: Permission };
const pending = ref<PendingAction | null>(null);
const pendingVisible = computed({
  get: () => pending.value !== null,
  set: (open: boolean) => {
    if (!open) pending.value = null;
  },
});

const isSelf = computed(() => user.value?.id === auth.user?.id);
const isStudent = computed(() => user.value?.roles.includes(Roles.STUDENT) ?? false);
const state = computed(() => (user.value ? userState(user.value) : null));
const canUnblock = computed(
  () => user.value !== null && (user.value.status === 'BLOCKED' || state.value?.tone === 'warning'),
);
const permissionOptions = computed(() =>
  props.permissions.map((item) => ({
    value: item.code,
    label: item.sensitive ? `${item.description} (конфиденциально)` : item.description,
  })),
);
const pendingText = computed(() => {
  const action = pending.value;
  if (action === 'block') {
    return {
      title: 'Блокировка учётной записи',
      message: 'Пользователь не сможет войти, все его сеансы будут завершены.',
      confirm: 'Заблокировать',
    };
  }
  if (action === 'reset') {
    return {
      title: 'Сброс пароля',
      message: 'Будет выдан временный пароль, все сеансы пользователя завершатся.',
      confirm: 'Сбросить пароль',
    };
  }
  return {
    title: 'Отзыв разрешения',
    message: 'Разрешение перестанет действовать сразу.',
    confirm: 'Отозвать',
  };
});

function apply(details: UserDetails): void {
  user.value = details;
  profile.lastName = details.lastName;
  profile.firstName = details.firstName;
  profile.middleName = details.middleName ?? '';
  profile.email = details.email ?? '';
  roles.value = details.roles.filter((role) => STAFF_ROLES.includes(role));
}

async function load(): Promise<void> {
  if (!props.userId) return;
  loadError.value = null;
  try {
    apply(await api<UserDetails>(`/admin/users/${props.userId}`));
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить данные';
  }
}

watch(
  () => [visible.value, props.userId] as const,
  ([open]) => {
    if (!open) return;
    user.value = null;
    temporaryPassword.value = null;
    notice.value = null;
    actionError.value = null;
    profileErrors.value = {};
    grantErrors.value = {};
    void load();
  },
  { immediate: true },
);

/** Выполняет действие над учётной записью и показывает результат. */
async function run(
  request: () => Promise<UserDetails | TemporaryPasswordResult>,
  success: string,
  fieldErrors?: typeof profileErrors,
): Promise<boolean> {
  busy.value = true;
  actionError.value = null;
  notice.value = null;
  if (fieldErrors) fieldErrors.value = {};
  try {
    const result = await request();
    if ('temporaryPassword' in result) {
      temporaryPassword.value = result.temporaryPassword;
      apply(result.user);
    } else {
      apply(result);
    }
    notice.value = success;
    emit('changed');
    return true;
  } catch (error) {
    actionError.value = error instanceof ApiError ? error.message : 'Не удалось выполнить действие';
    if (fieldErrors && error instanceof ApiError) fieldErrors.value = error.fields;
    return false;
  } finally {
    busy.value = false;
  }
}

function saveProfile(): Promise<boolean> {
  return run(
    () =>
      api<UserDetails>(`/admin/users/${user.value!.id}`, {
        method: 'PATCH',
        body: {
          lastName: profile.lastName,
          firstName: profile.firstName,
          middleName: profile.middleName || null,
          email: profile.email || null,
        },
      }),
    'Данные сохранены.',
    profileErrors,
  );
}

function saveRoles(): Promise<boolean> {
  return run(
    () =>
      api<UserDetails>(`/admin/users/${user.value!.id}/roles`, {
        method: 'PUT',
        body: { roles: roles.value },
      }),
    'Роли изменены.',
  );
}

function unblock(): Promise<boolean> {
  return run(
    () => api<UserDetails>(`/admin/users/${user.value!.id}/unblock`, { method: 'POST' }),
    'Учётная запись разблокирована.',
  );
}

async function submitGrant(): Promise<void> {
  const ok = await run(
    () =>
      api<UserDetails>(`/admin/users/${user.value!.id}/permissions`, {
        method: 'POST',
        body: {
          permission: grant.permission,
          reason: grant.reason,
          expiresAt: grant.expiresAt?.toISOString(),
        },
      }),
    'Разрешение выдано.',
    grantErrors,
  );
  if (ok) Object.assign(grant, { permission: null, reason: '', expiresAt: null });
}

async function confirmPending(reason: string): Promise<void> {
  const action = pending.value;
  const id = user.value!.id;
  let ok = false;
  if (action === 'block') {
    ok = await run(
      () => api<UserDetails>(`/admin/users/${id}/block`, { method: 'POST', body: { reason } }),
      'Учётная запись заблокирована.',
    );
  } else if (action === 'reset') {
    ok = await run(
      () => api<TemporaryPasswordResult>(`/admin/users/${id}/reset-password`, { method: 'POST' }),
      'Пароль сброшен.',
    );
  } else if (action) {
    ok = await run(
      () =>
        api<UserDetails>(`/admin/users/${id}/permissions/${action.revoke}`, {
          method: 'DELETE',
          body: { reason },
        }),
      'Разрешение отозвано.',
    );
  }
  if (ok) pending.value = null;
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="user ? formatFullName(user) : 'Учётная запись'"
    :style="{ width: '44rem' }"
    :breakpoints="{ '767px': '100vw' }"
    class="user-editor-dialog"
  >
    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="!user" role="status">Загрузка…</p>
    <div v-else class="user-editor">
      <div class="user-editor__meta">
        <StatusBadge v-if="state" :label="state.label" :tone="state.tone" />
        <span
          >Логин: <strong>{{ user.login }}</strong></span
        >
        <span>Последний вход: {{ formatDateTime(user.lastLoginAt) }}</span>
        <span v-if="user.mustChangePassword">Требуется смена временного пароля</span>
      </div>

      <TemporaryPassword v-if="temporaryPassword" :password="temporaryPassword" />
      <Message v-if="notice" severity="success" role="status">{{ notice }}</Message>
      <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>
      <Message v-if="isSelf" severity="info">
        Собственные роли, разрешения, блокировку и пароль изменяет другой администратор. Свой пароль
        можно сменить в меню профиля.
      </Message>
      <Message v-if="isStudent" severity="info">
        ФИО и роли студента ведутся в разделе «Студенты». Здесь доступны блокировка и сброс пароля.
      </Message>

      <section v-if="!isStudent" class="user-editor__section">
        <h3>Данные пользователя</h3>
        <form class="user-editor__grid" novalidate @submit.prevent="saveProfile">
          <div
            v-for="field in [
              { key: 'lastName', label: 'Фамилия' },
              { key: 'firstName', label: 'Имя' },
              { key: 'middleName', label: 'Отчество' },
              { key: 'email', label: 'Электронная почта' },
            ] as const"
            :key="field.key"
            class="user-editor__field"
          >
            <label :for="`edit-${field.key}`">{{ field.label }}</label>
            <InputText
              :id="`edit-${field.key}`"
              v-model="profile[field.key]"
              :invalid="!!profileErrors[field.key]"
              fluid
            />
            <small v-if="profileErrors[field.key]" class="user-editor__error">
              {{ profileErrors[field.key] }}
            </small>
          </div>
          <div class="user-editor__actions">
            <Button type="submit" label="Сохранить данные" icon="pi pi-save" :loading="busy" />
          </div>
        </form>
      </section>

      <section v-if="!isStudent" class="user-editor__section">
        <h3>Роли</h3>
        <div class="user-editor__roles">
          <div v-for="role in STAFF_ROLES" :key="role" class="user-editor__role">
            <Checkbox
              v-model="roles"
              :input-id="`edit-role-${role}`"
              :value="role"
              :disabled="isSelf"
            />
            <label :for="`edit-role-${role}`">{{ ROLE_LABELS[role] }}</label>
          </div>
        </div>
        <div class="user-editor__actions">
          <Button
            label="Сохранить роли"
            icon="pi pi-users"
            severity="secondary"
            :disabled="isSelf || roles.length === 0"
            :loading="busy"
            @click="saveRoles"
          />
        </div>
      </section>

      <section class="user-editor__section">
        <h3>Доступ</h3>
        <div class="user-editor__actions">
          <Button
            v-if="canUnblock"
            label="Разблокировать"
            icon="pi pi-lock-open"
            severity="secondary"
            :disabled="isSelf"
            :loading="busy"
            @click="unblock"
          />
          <Button
            v-if="user.status !== 'BLOCKED'"
            label="Заблокировать"
            icon="pi pi-lock"
            severity="danger"
            outlined
            :disabled="isSelf"
            @click="pending = 'block'"
          />
          <Button
            label="Сбросить пароль"
            icon="pi pi-key"
            severity="secondary"
            outlined
            :disabled="isSelf"
            @click="pending = 'reset'"
          />
        </div>
      </section>

      <section v-if="!isStudent" class="user-editor__section">
        <h3>Индивидуальные разрешения</h3>
        <p class="user-editor__muted">
          Выдаются сверх ролей с указанием основания, например доступ к диагностическим ответам или
          к персональным данным для исследователя.
        </p>
        <p v-if="user.grantedPermissions.length === 0" class="user-editor__muted">
          Индивидуальных разрешений нет.
        </p>
        <ul v-else class="user-editor__grants">
          <li v-for="item in user.grantedPermissions" :key="item.permission">
            <div>
              <strong>{{ item.description }}</strong>
              <div class="user-editor__muted">
                Основание: {{ item.reason }} · выдал {{ item.grantedByName ?? '—' }}
                {{ formatDateTime(item.grantedAt) }} · действует
                {{ item.expiresAt ? `до ${formatDateTime(item.expiresAt)}` : 'бессрочно' }}
              </div>
            </div>
            <Button
              label="Отозвать"
              size="small"
              severity="danger"
              text
              :disabled="isSelf"
              @click="pending = { revoke: item.permission }"
            />
          </li>
        </ul>
        <form v-if="!isSelf" class="user-editor__grid" novalidate @submit.prevent="submitGrant">
          <div class="user-editor__field user-editor__field--wide">
            <label for="grant-permission">Разрешение</label>
            <Select
              v-model="grant.permission"
              input-id="grant-permission"
              :options="permissionOptions"
              option-label="label"
              option-value="value"
              placeholder="Выберите разрешение"
              :invalid="!!grantErrors.permission"
              fluid
            />
            <small v-if="grantErrors.permission" class="user-editor__error">
              {{ grantErrors.permission }}
            </small>
          </div>
          <div class="user-editor__field user-editor__field--wide">
            <label for="grant-reason">Основание</label>
            <Textarea
              id="grant-reason"
              v-model="grant.reason"
              rows="2"
              maxlength="500"
              :invalid="!!grantErrors.reason"
              fluid
            />
            <small v-if="grantErrors.reason" class="user-editor__error">
              {{ grantErrors.reason }}
            </small>
          </div>
          <div class="user-editor__field">
            <label for="grant-expires">Действует до (необязательно)</label>
            <DatePicker
              v-model="grant.expiresAt"
              input-id="grant-expires"
              :min-date="new Date()"
              show-icon
              fluid
            />
          </div>
          <div class="user-editor__actions">
            <Button type="submit" label="Выдать разрешение" icon="pi pi-plus" :loading="busy" />
          </div>
        </form>
      </section>
    </div>

    <ActionDialog
      v-model:visible="pendingVisible"
      :title="pendingText.title"
      :message="pendingText.message"
      :confirm-label="pendingText.confirm"
      :require-reason="pending !== 'reset'"
      :danger="pending !== 'reset'"
      :busy="busy"
      :error="actionError"
      @confirm="confirmPending"
    />
  </Dialog>
</template>

<style scoped>
.user-editor {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.user-editor__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2) var(--iot-space-4);
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.user-editor__section {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  padding-top: var(--iot-space-3);
  border-top: 1px solid var(--iot-color-border);
}

.user-editor__section h3 {
  margin: 0;
  font-size: 1rem;
}

.user-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--iot-space-3);
}

.user-editor__field {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
}

.user-editor__field--wide,
.user-editor__actions {
  grid-column: 1 / -1;
}

.user-editor__field label {
  font-weight: 600;
}

.user-editor__roles {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-4);
}

.user-editor__role {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.user-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.user-editor__grants {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.user-editor__grants li {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--iot-space-2);
  padding: var(--iot-space-2) var(--iot-space-3);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
}

.user-editor__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.user-editor__error {
  color: var(--iot-tone-danger-text);
}

@media (max-width: 575px) {
  .user-editor__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
