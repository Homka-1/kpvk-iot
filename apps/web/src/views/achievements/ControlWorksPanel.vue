<script setup lang="ts">
import {
  CONTROL_KIND_LABELS,
  type ControlKind,
  type ControlOptionsDto,
  type ControlWorkDetailDto,
  type ControlWorkListDto,
  Permission,
} from '@iot/shared';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { formatDate } from '@/utils/format';
import ControlWorkDialog from './ControlWorkDialog.vue';
import { KIND_ICONS, KIND_OPTIONS, scoreText } from './format';

/**
 * Контрольные работы (этап 28): входной, текущий и итоговый контроль. Одна работа — одна тема и
 * рубрика для нескольких групп, поэтому результаты ЭГ и КГ сравнимы. Работа открывается на
 * отдельной странице с ведомостями групп и сравнением результатов.
 */
const auth = useAuthStore();
const context = useContextStore();
const router = useRouter();
const canManage = computed(() => auth.hasPermission(Permission.GRADES_MANAGE));

const options = ref<ControlOptionsDto | null>(null);
const list = ref<ControlWorkListDto | null>(null);
const error = ref<string | null>(null);
const groupId = ref<string | null>(context.groupId);
const disciplineId = ref<string | null>(context.disciplineId);
const kind = ref<ControlKind | null>(null);
const createOpen = ref(false);

async function loadOptions(): Promise<void> {
  try {
    options.value = await api<ControlOptionsDto>('/control-works/options');
    if (groupId.value && !options.value.groups.some((item) => item.id === groupId.value)) {
      groupId.value = null;
    }
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить группы';
  }
}

async function load(): Promise<void> {
  error.value = null;
  try {
    list.value = await api<ControlWorkListDto>('/control-works', {
      query: { groupId: groupId.value, disciplineId: disciplineId.value, kind: kind.value },
    });
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить работы';
  }
}

function opened(detail: ControlWorkDetailDto): void {
  void router.push({ name: 'control-work', params: { id: detail.work.id } });
}

watch([groupId, disciplineId, kind], load);
onMounted(async () => {
  await loadOptions();
  await load();
});
</script>

<template>
  <div class="works">
    <div class="works__toolbar">
      <div class="works__filters">
        <div class="iot-field">
          <label for="works-group">Группа</label>
          <Select
            v-model="groupId"
            input-id="works-group"
            :options="options?.groups ?? []"
            option-label="name"
            option-value="id"
            placeholder="Все группы"
            show-clear
          />
        </div>
        <div class="iot-field">
          <label for="works-discipline">Дисциплина</label>
          <Select
            v-model="disciplineId"
            input-id="works-discipline"
            :options="options?.disciplines ?? []"
            option-label="name"
            option-value="id"
            placeholder="Все дисциплины"
            filter
            show-clear
          />
        </div>
        <div class="iot-field">
          <label for="works-kind">Вид контроля</label>
          <Select
            v-model="kind"
            input-id="works-kind"
            :options="KIND_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="Все виды"
            show-clear
          />
        </div>
      </div>
      <Button
        v-if="canManage"
        label="Новая работа"
        icon="pi pi-plus"
        size="small"
        @click="createOpen = true"
      />
    </div>
    <p class="works__hint">
      Входной контроль — стартовый уровень знаний, текущий — результаты практических работ, итоговый
      — освоение программы. Одинаковые работы и рубрика для экспериментальной и контрольной групп
      позволяют сравнить результаты. Шкала 0–100; отсутствие и невыполненная работа отмечаются
      отдельно и не считаются нулём. Динамика каждого студента — в его профиле.
    </p>

    <ErrorState v-if="error" :message="error" retryable @retry="load" />
    <p v-else-if="!list" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="list.items.length === 0"
      icon="pi pi-graduation-cap"
      title="Контрольных работ нет"
      :description="
        canManage
          ? 'Создайте входную контрольную работу кнопкой «Новая работа» и выберите группы.'
          : 'Работы создают администратор и преподаватели групп.'
      "
    />
    <ul v-else class="works__list">
      <li v-for="work in list.items" :key="work.id" class="iot-card works__item">
        <RouterLink :to="{ name: 'control-work', params: { id: work.id } }" class="works__link">
          <span class="works__kind">
            <i :class="KIND_ICONS[work.kind]" aria-hidden="true" />
            {{ CONTROL_KIND_LABELS[work.kind] }}
          </span>
          <strong class="works__topic">{{ work.topic }}</strong>
          <span class="works__muted">{{ work.discipline.name }}</span>
        </RouterLink>
        <ul class="works__groups" aria-label="Группы">
          <li v-for="item in work.groups" :key="item.group.id">
            <strong>{{ item.group.name }}</strong
            >, {{ formatDate(item.date) }} · средний балл:
            {{ scoreText(item.mean) }}
            <span v-if="item.scored > 0" class="works__muted">(баллов: {{ item.scored }})</span>
          </li>
        </ul>
      </li>
    </ul>

    <ControlWorkDialog v-model:visible="createOpen" :options="options" @saved="opened" />
  </div>
</template>

<style scoped>
.works {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.works__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--iot-space-3);
}

.works__filters {
  display: flex;
  flex: 1 1 30rem;
  flex-wrap: wrap;
  gap: var(--iot-space-2);
}

.works__filters .iot-field {
  flex: 1 1 12rem;
  min-width: 0;
}

.works__hint,
.works__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.works__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.works__item {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  padding: var(--iot-space-3) var(--iot-space-4);
}

.works__link {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  color: inherit;
  text-decoration: none;
}

.works__link:hover .works__topic,
.works__link:focus-visible .works__topic {
  text-decoration: underline;
}

.works__kind {
  color: var(--iot-color-heading);
  font-size: 0.8125rem;
  font-weight: 600;
}

.works__topic {
  color: var(--iot-color-heading);
  overflow-wrap: anywhere;
}

.works__groups {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
}
</style>
