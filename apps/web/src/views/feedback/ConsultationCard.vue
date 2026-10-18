<script setup lang="ts">
import { CONSULTATION_OPEN_STATUSES, type CabinetConsultationDto } from '@iot/shared';
import Button from 'primevue/button';
import { computed } from 'vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDateTime } from '@/utils/format';
import { consultationBadge, INTERNAL_BADGE } from './content';

/**
 * Консультация (FR-067): тема, статус, время, итог. Внутренняя заметка приходит только
 * сотрудникам — студенту сервер её не передаёт (FR-068). Действия — у преподавателя.
 */
const props = withDefaults(
  defineProps<{
    item: CabinetConsultationDto & { internalNote?: string | null };
    mode: 'staff' | 'student';
    showStudent?: boolean;
    canManage?: boolean;
  }>(),
  { showStudent: false, canManage: false },
);
const emit = defineEmits<{ schedule: []; hold: []; cancel: [] }>();

const open = computed(() => CONSULTATION_OPEN_STATUSES.includes(props.item.status));
const actions = computed(() => props.mode === 'staff' && props.canManage && open.value);
</script>

<template>
  <article class="consultation iot-card" aria-label="Консультация">
    <div class="consultation__head">
      <i class="pi pi-users" aria-hidden="true" />
      <strong>Консультация: {{ item.topic }}</strong>
      <StatusBadge v-bind="consultationBadge(item.status)" />
    </div>
    <dl class="consultation__facts">
      <template v-if="showStudent">
        <dt>Студент</dt>
        <dd>
          <RouterLink :to="{ path: `/students/${item.student.id}`, query: { tab: 'support' } }">
            {{ item.student.fullName }}
          </RouterLink>
          <span v-if="item.student.groupName"> ({{ item.student.groupName }})</span>
        </dd>
      </template>
      <dt>Инициатор</dt>
      <dd>{{ item.requestedByStudent ? 'Запрос студента' : 'Назначена преподавателем' }}</dd>
      <template v-if="item.trajectory">
        <dt>ИОТ</dt>
        <dd>{{ item.trajectory.disciplineName }}</dd>
      </template>
      <dt>Преподаватель</dt>
      <dd>{{ item.teacher?.fullName ?? 'Ещё не назначен' }}</dd>
      <dt>{{ item.status === 'HELD' ? 'Проведена' : 'Время' }}</dt>
      <dd>
        {{
          item.status === 'HELD'
            ? formatDateTime(item.heldAt)
            : item.scheduledAt
              ? formatDateTime(item.scheduledAt)
              : 'Время ещё не назначено'
        }}
      </dd>
      <dt>Создана</dt>
      <dd>{{ formatDateTime(item.createdAt) }}</dd>
    </dl>
    <div v-if="item.summary" class="consultation__text">
      <strong>Итог консультации</strong>
      <p>{{ item.summary }}</p>
    </div>
    <div v-if="mode === 'staff' && item.internalNote" class="consultation__text consultation__note">
      <StatusBadge v-bind="INTERNAL_BADGE" />
      <p>{{ item.internalNote }}</p>
    </div>
    <div v-if="actions" class="consultation__actions">
      <Button
        :label="item.status === 'REQUESTED' ? 'Назначить время' : 'Перенести'"
        icon="pi pi-calendar"
        size="small"
        outlined
        @click="emit('schedule')"
      />
      <Button label="Отметить проведённой" icon="pi pi-check" size="small" @click="emit('hold')" />
      <Button
        label="Отменить"
        icon="pi pi-times"
        size="small"
        severity="secondary"
        text
        @click="emit('cancel')"
      />
    </div>
  </article>
</template>

<style scoped>
.consultation {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.consultation__head,
.consultation__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.consultation__head .pi {
  color: var(--iot-navy-700);
}

.consultation__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--iot-space-1) var(--iot-space-3);
  margin: 0;
  font-size: 0.875rem;
}

.consultation__facts dt {
  color: var(--iot-color-muted);
}

.consultation__facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.consultation__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--iot-space-1);
}

.consultation__text p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.consultation__note {
  padding: var(--iot-space-2);
  border-radius: var(--iot-radius);
  background: var(--iot-tone-neutral-bg);
}

@media (max-width: 479px) {
  .consultation__facts {
    grid-template-columns: 1fr;
  }

  .consultation__facts dd {
    margin-bottom: var(--iot-space-1);
  }
}
</style>
