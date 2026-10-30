<script setup lang="ts">
import {
  DIFFICULTY_LEVEL_LABELS,
  DifficultyLevel,
  type LibraryAssignmentDto,
  MATERIAL_KIND_LABELS,
  type MaterialDto,
  type StageAssignmentDto,
  type StageMaterialDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';

/**
 * Выбор материалов или заданий библиотеки для этапа (FR-037). Предлагаются только записи
 * дисциплины маршрута (и общие материалы), архивные не предлагаются. Задания изначально
 * отфильтрованы по рекомендуемой сложности этапа из шаблона ИОТ; фильтр можно сбросить —
 * профиль не ограничивает сложность (FR-033).
 */
const props = defineProps<{
  kind: 'materials' | 'assignments';
  disciplineId: string;
  /** Уже добавленные в этап id — отмечены и не добавляются повторно. */
  selectedIds: string[];
  /** Рекомендуемая сложность заданий этапа; null — без рекомендации. */
  recommendedDifficulty?: DifficultyLevel | null;
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{
  pickMaterials: [items: StageMaterialDto[]];
  pickAssignments: [items: StageAssignmentDto['assignment'][]];
}>();

interface Row {
  id: string;
  title: string;
  hint: string;
  difficulty?: DifficultyLevel;
  material?: StageMaterialDto;
  assignment?: StageAssignmentDto['assignment'];
}

const rows = ref<Row[] | null>(null);
const error = ref<string | null>(null);
const search = ref('');
const chosen = ref<string[]>([]);
const difficulty = ref<DifficultyLevel | null>(null);
const difficultyOptions = Object.values(DifficultyLevel).map((value) => ({
  value,
  label: DIFFICULTY_LEVEL_LABELS[value],
}));
const title = computed(() =>
  props.kind === 'materials' ? 'Материалы из библиотеки' : 'Задания из библиотеки',
);

async function load(): Promise<void> {
  rows.value = null;
  error.value = null;
  try {
    if (props.kind === 'materials') {
      const items = await api<MaterialDto[]>('/materials');
      rows.value = items
        .filter((item) => !item.discipline || item.discipline.id === props.disciplineId)
        .map((item) => ({
          id: item.id,
          title: item.title,
          hint: [MATERIAL_KIND_LABELS[item.kind], item.discipline ? item.topic : 'общий материал']
            .filter(Boolean)
            .join(' · '),
          material: { id: item.id, title: item.title, kind: item.kind, archived: false },
        }));
    } else {
      const items = await api<LibraryAssignmentDto[]>('/library-assignments', {
        query: { disciplineId: props.disciplineId },
      });
      rows.value = items.map((item) => ({
        id: item.id,
        title: item.title,
        difficulty: item.difficulty,
        hint: [
          item.type.name,
          `сложность: ${DIFFICULTY_LEVEL_LABELS[item.difficulty].toLowerCase()}`,
          item.topic,
        ]
          .filter(Boolean)
          .join(' · '),
        assignment: {
          id: item.id,
          title: item.title,
          typeName: item.type.name,
          difficulty: item.difficulty,
          archived: false,
        },
      }));
    }
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Не удалось загрузить библиотеку';
  }
}

watch(
  visible,
  (open) => {
    if (!open) return;
    search.value = '';
    chosen.value = [];
    difficulty.value = props.recommendedDifficulty ?? null;
    void load();
  },
  { immediate: true },
);

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  return (rows.value ?? []).filter(
    (row) =>
      (!query || `${row.title} ${row.hint}`.toLowerCase().includes(query)) &&
      (!difficulty.value || row.difficulty === difficulty.value),
  );
});

function add(): void {
  const picked = (rows.value ?? []).filter((row) => chosen.value.includes(row.id));
  if (props.kind === 'materials')
    emit(
      'pickMaterials',
      picked.map((row) => row.material!),
    );
  else
    emit(
      'pickAssignments',
      picked.map((row) => row.assignment!),
    );
  visible.value = false;
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="title"
    :style="{ width: '40rem' }"
    :breakpoints="{ '575px': '95vw' }"
  >
    <div class="picker">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          placeholder="Поиск по названию и теме"
          aria-label="Поиск"
          fluid
        />
      </IconField>
      <template v-if="kind === 'assignments'">
        <Select
          v-model="difficulty"
          :options="difficultyOptions"
          option-label="label"
          option-value="value"
          placeholder="Любая сложность"
          show-clear
          aria-label="Фильтр по уровню сложности"
          fluid
        />
        <p v-if="recommendedDifficulty" class="picker__hint">
          Рекомендуемая сложность для этапа по шаблону ИОТ:
          {{ DIFFICULTY_LEVEL_LABELS[recommendedDifficulty].toLowerCase() }}. Это подсказка — можно
          выбрать задания любой сложности.
        </p>
      </template>
      <ErrorState v-if="error" :message="error" retryable @retry="load" />
      <p v-else-if="!rows" role="status">Загрузка…</p>
      <EmptyState
        v-else-if="filtered.length === 0"
        icon="pi pi-book"
        :title="rows.length ? 'Ничего не найдено' : 'В библиотеке дисциплины пока пусто'"
        :description="
          rows.length
            ? kind === 'assignments'
              ? 'Измените запрос поиска или уровень сложности.'
              : 'Измените запрос поиска.'
            : 'Добавьте записи в разделах «Задания» и «Библиотека материалов».'
        "
      />
      <ul v-else class="picker__list">
        <li v-for="row in filtered" :key="row.id">
          <Checkbox
            v-model="chosen"
            :input-id="`pick-${row.id}`"
            :value="row.id"
            :disabled="selectedIds.includes(row.id)"
          />
          <label :for="`pick-${row.id}`">
            <span class="picker__title">{{ row.title }}</span>
            <span class="picker__hint">
              {{ selectedIds.includes(row.id) ? 'Уже в этапе' : row.hint }}
            </span>
          </label>
        </li>
      </ul>
      <div class="iot-form-buttons">
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button
          :label="chosen.length ? `Добавить (${chosen.length})` : 'Добавить'"
          icon="pi pi-plus"
          :disabled="chosen.length === 0"
          @click="add"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.picker__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  max-height: 50vh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.picker__list li {
  display: flex;
  gap: var(--iot-space-2);
  align-items: flex-start;
}

.picker__list label {
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

.picker__title {
  font-weight: 600;
}

.picker__hint {
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}
</style>
