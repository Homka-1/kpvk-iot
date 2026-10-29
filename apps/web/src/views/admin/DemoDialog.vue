<script setup lang="ts">
import { DemoJobStatus, DemoStage, type DemoStatusDto } from '@iot/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import { formatDate } from '@/utils/format';

/**
 * Демонстрационное отображение: копия рабочей базы с активностью за период исследования.
 * Пока отображение включено, все пользователи видят копию; рабочие данные не меняются.
 */
const visible = defineModel<boolean>('visible', { required: true });

const POLL_MS = 1500;
const status = ref<DemoStatusDto | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
const confirmReset = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

const running = computed(() => status.value?.job?.status === DemoJobStatus.RUNNING);
const stageText = computed(() => {
  switch (status.value?.stage) {
    case DemoStage.PRIMARY:
      return 'Подготовлены: первичный замер и учебный период до окончания ИОТ';
    case DemoStage.REPEATED:
      return 'Подготовлены полностью, включая повторный замер';
    default:
      return 'Не подготовлены';
  }
});
const period = computed(() =>
  status.value
    ? `${formatDate(status.value.period.from)} — ${formatDate(status.value.period.to)}`
    : '',
);

async function load(): Promise<void> {
  try {
    status.value = await api<DemoStatusDto>('/admin/demo');
    error.value = null;
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Не удалось загрузить состояние';
  }
  schedule();
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = visible.value && running.value ? setTimeout(load, POLL_MS) : null;
}

async function call(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) {
  busy.value = true;
  error.value = null;
  try {
    status.value = await api<DemoStatusDto>(path, { method, body });
    return true;
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Не удалось выполнить действие';
    return false;
  } finally {
    busy.value = false;
    schedule();
  }
}

async function setMode(active: boolean): Promise<void> {
  // Все разделы должны загрузить данные заново из выбранной базы.
  if (await call('/admin/demo/mode', 'PUT', { active })) window.location.reload();
}

async function reset(): Promise<void> {
  const wasActive = status.value?.active;
  if (await call('/admin/demo', 'DELETE')) {
    confirmReset.value = false;
    if (wasActive) window.location.reload();
  }
}

watch(
  visible,
  (open) => {
    if (open) void load();
    else if (timer) clearTimeout(timer);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Демонстрационное отображение"
    :style="{ width: '36rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <div class="demo">
      <p class="demo__hint">
        Копия рабочей базы с активностью за период исследования ({{ period }}). Пока отображение
        включено, все пользователи работают с копией; рабочие данные не изменяются.
      </p>

      <dl v-if="status" class="demo__facts">
        <dt>Отображение</dt>
        <dd>
          <i :class="status.active ? 'pi pi-eye' : 'pi pi-eye-slash'" aria-hidden="true" />
          {{ status.active ? 'Включено: сайт показывает демо-данные' : 'Выключено' }}
        </dd>
        <dt>Демо-данные</dt>
        <dd>{{ stageText }}</dd>
      </dl>

      <Message v-if="running" severity="info" :closable="false">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        {{ status?.job?.step ?? 'Выполняется…' }}
      </Message>
      <Message
        v-else-if="status?.job?.status === DemoJobStatus.FAILED"
        severity="error"
        role="alert"
      >
        Операция не выполнена: {{ status.job.error }}
      </Message>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>

      <div v-if="status" class="demo__actions">
        <div class="demo__action">
          <Button
            :label="status.stage === DemoStage.NONE ? 'Подготовить данные' : 'Подготовить заново'"
            icon="pi pi-database"
            :disabled="busy || running || status.active"
            @click="call('/admin/demo/prepare', 'POST')"
          />
          <small>
            Новая копия рабочей базы: преподаватели, расписание и журнал, первичная диагностика и
            профили, исследование, ИОТ группы ЭГ, обращения и консультации, оценки за семестры.
            <template v-if="status.active">Сначала выключите отображение.</template>
          </small>
        </div>
        <div class="demo__action">
          <Button
            label="Провести повторный замер"
            icon="pi pi-replay"
            severity="secondary"
            :disabled="busy || running || status.stage !== DemoStage.PRIMARY"
            @click="call('/admin/demo/repeat', 'POST')"
          />
          <small>Повторная диагностика после завершения ИОТ (апрель 2026 года).</small>
        </div>
        <div class="demo__action">
          <Button
            :label="status.active ? 'Выключить отображение' : 'Включить отображение'"
            :icon="status.active ? 'pi pi-eye-slash' : 'pi pi-eye'"
            severity="secondary"
            :disabled="busy || running || (!status.active && status.stage === DemoStage.NONE)"
            @click="setMode(!status.active)"
          />
          <small>После переключения страница перезагрузится.</small>
        </div>
        <div class="demo__action">
          <Button
            label="Удалить демо-данные"
            icon="pi pi-trash"
            severity="danger"
            text
            :disabled="busy || running || !status.exists"
            @click="confirmReset = true"
          />
        </div>
      </div>
    </div>
  </Dialog>
  <ActionDialog
    v-model:visible="confirmReset"
    title="Удалить демо-данные?"
    message="Отображение будет выключено, копия базы удалена. Рабочие данные не затрагиваются."
    confirm-label="Удалить"
    danger
    :busy="busy"
    :error="error"
    @confirm="reset"
  />
</template>

<style scoped>
.demo {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.demo p {
  margin: 0;
}

.demo__hint,
.demo__action small {
  color: var(--iot-color-muted);
}

.demo__facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--iot-space-1) var(--iot-space-3);
  margin: 0;
}

.demo__facts dt {
  font-weight: 600;
}

.demo__facts dd {
  margin: 0;
}

.demo__actions {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.demo__action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-1);
}
</style>
