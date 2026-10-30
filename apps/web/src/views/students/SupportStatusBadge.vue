<script setup lang="ts">
import { SupportStatus, type SupportStatusDetailsDto } from '@iot/shared';
import Popover from 'primevue/popover';
import { computed, ref, useId } from 'vue';
import { api, ApiError } from '@/api/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import { supportBadge } from './labels';

/**
 * Статус сопровождения студента (FR-060). Отметка «Требует внимания» или «Нужно дополнительное
 * сопровождение» открывается пояснением: кто и почему отметил, есть ли нерассмотренные
 * затруднения, и ссылки на вкладки профиля, где это видно. Без `interactive` — обычная плашка.
 */
const props = defineProps<{ studentId: string; status: SupportStatus; interactive?: boolean }>();

const panelId = useId();
const panel = ref<InstanceType<typeof Popover>>();
const details = ref<SupportStatusDetailsDto | null>(null);
const error = ref<string | null>(null);
const badge = computed(() => supportBadge(props.status));
const clickable = computed(() => props.interactive && props.status !== SupportStatus.STANDARD);

async function load(): Promise<void> {
  error.value = null;
  try {
    details.value = await api<SupportStatusDetailsDto>(
      `/students/${props.studentId}/support-status`,
    );
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить пояснение';
  }
}

function toggle(event: Event): void {
  panel.value?.toggle(event);
  void load();
}

const tabLink = (tab: string) => ({
  name: 'student-details',
  params: { id: props.studentId },
  query: { tab },
});
</script>

<template>
  <StatusBadge v-if="!clickable" v-bind="badge" />
  <template v-else>
    <button
      type="button"
      class="support-badge"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      :aria-label="`${badge.label}: почему?`"
      title="Почему?"
      @click="toggle"
    >
      <StatusBadge v-bind="badge" />
    </button>
    <Popover :id="panelId" ref="panel">
      <section class="support-details" :aria-labelledby="`${panelId}-title`">
        <h2 :id="`${panelId}-title`" class="support-details__title">{{ badge.label }}</h2>
        <p v-if="error" class="support-details__muted" role="alert">{{ error }}</p>
        <p v-else-if="!details" class="support-details__muted" role="status">Загрузка…</p>
        <template v-else>
          <template v-if="details.lastChange">
            <p class="support-details__reason">
              {{ details.lastChange.reason ?? 'Основание не указано' }}
            </p>
            <p class="support-details__muted">
              Отметка: {{ details.lastChange.actor?.fullName ?? 'Нет данных' }},
              {{ formatDateTime(details.lastChange.at) }}
            </p>
          </template>
          <p v-else class="support-details__muted">Основание отметки не записано в журнале.</p>
          <p v-if="details.openDifficulties > 0">
            Нерассмотренных сообщений о затруднениях: {{ details.openDifficulties }}
          </p>
          <ul class="support-details__links">
            <li>
              <RouterLink :to="tabLink('support')" @click="panel?.hide()">
                Обращения и консультации — вкладка «Сопровождение»
              </RouterLink>
            </li>
            <li>
              <RouterLink :to="tabLink('history')" @click="panel?.hide()">
                Все изменения статуса — вкладка «История»
              </RouterLink>
            </li>
          </ul>
        </template>
      </section>
    </Popover>
  </template>
</template>

<style scoped>
.support-badge {
  display: inline-flex;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: none;
  cursor: pointer;
}

.support-details {
  width: min(22rem, calc(100vw - 2 * var(--iot-space-4)));
}

.support-details__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1rem;
  color: var(--iot-color-heading);
}

.support-details p {
  margin: 0 0 var(--iot-space-2);
}

.support-details__reason {
  white-space: pre-line;
}

.support-details__muted {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.support-details__links {
  display: grid;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
