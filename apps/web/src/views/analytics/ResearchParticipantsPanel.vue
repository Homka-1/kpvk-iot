<script setup lang="ts">
import {
  RESEARCH_GROUP_LABELS,
  RESEARCH_GROUP_SHORT,
  RESEARCH_GROUPS,
  type ResearchAddParticipantsResultDto,
  type ResearchCandidateGroupDto,
  ResearchGroup,
  type ResearchParticipantDto,
  researchParticipantsFormSchema,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';
import { issuesToErrors } from '@/views/library/form';

/**
 * Участники исследования (UC-07): включение учебных групп в экспериментальную или контрольную
 * группу, коды участников, исключение с причиной. ФИО видно только с отдельным разрешением —
 * сервер иначе его не передаёт (п. 2.4). Студента с ИОТ в работе в контрольную группу сервер
 * не включит (огр. 4).
 */
const props = defineProps<{ projectId: string; editable: boolean; canManage: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const participants = ref<ResearchParticipantDto[] | null>(null);
const candidates = ref<ResearchCandidateGroupDto[]>([]);
const loadError = ref<string | null>(null);
const groupId = ref<string | null>(null);
const group = ref<ResearchGroup>(ResearchGroup.EXPERIMENTAL);
const errors = ref<Record<string, string>>({});
const addError = ref<string | null>(null);
const result = ref<ResearchAddParticipantsResultDto | null>(null);
const busy = ref(false);
const excluding = ref<ResearchParticipantDto | null>(null);
const excludeError = ref<string | null>(null);
const excludeBusy = ref(false);

const canEdit = computed(() => props.canManage && props.editable);
const showNames = computed(() => participants.value?.some((item) => item.fullName) ?? false);
const groupOptions = computed(() =>
  candidates.value.map((item) => ({
    value: item.id,
    label: `${item.name} (студентов: ${item.students})`,
  })),
);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    const [list, groups] = await Promise.all([
      api<ResearchParticipantDto[]>(`/research-projects/${props.projectId}/participants`),
      canEdit.value
        ? api<ResearchCandidateGroupDto[]>('/research-projects/candidate-groups')
        : Promise.resolve([]),
    ]);
    participants.value = list;
    candidates.value = groups;
  } catch (caught) {
    loadError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось загрузить участников';
  }
}

async function add(): Promise<void> {
  addError.value = null;
  result.value = null;
  const parsed = researchParticipantsFormSchema.safeParse({
    groupId: groupId.value ?? '',
    group: group.value,
  });
  errors.value = parsed.success ? {} : issuesToErrors(parsed.error.issues);
  if (!parsed.success) return;
  busy.value = true;
  try {
    result.value = await api<ResearchAddParticipantsResultDto>(
      `/research-projects/${props.projectId}/participants`,
      { method: 'POST', body: parsed.data },
    );
    await load();
    emit('changed');
  } catch (caught) {
    if (caught instanceof ApiError) errors.value = caught.fields;
    addError.value = caught instanceof ApiError ? caught.message : 'Не удалось включить группу';
  } finally {
    busy.value = false;
  }
}

async function exclude(reason: string): Promise<void> {
  if (!excluding.value) return;
  excludeBusy.value = true;
  excludeError.value = null;
  try {
    await api(`/research-projects/${props.projectId}/participants/${excluding.value.id}/exclude`, {
      method: 'POST',
      body: { reason },
    });
    excluding.value = null;
    await load();
    emit('changed');
  } catch (caught) {
    excludeError.value =
      caught instanceof ApiError ? caught.message : 'Не удалось исключить участника';
  } finally {
    excludeBusy.value = false;
  }
}

onMounted(load);
defineExpose({ load });
</script>

<template>
  <section class="iot-card research-participants" aria-labelledby="research-participants-title">
    <h2 id="research-participants-title">Участники</h2>

    <form v-if="canEdit" class="research-participants__form" novalidate @submit.prevent="add">
      <div class="iot-field">
        <label id="participants-group-label" for="participants-group">Учебная группа</label>
        <Select
          v-model="groupId"
          input-id="participants-group"
          aria-labelledby="participants-group-label"
          :options="groupOptions"
          option-label="label"
          option-value="value"
          placeholder="Выберите группу"
          filter
          :invalid="!!errors.groupId"
          fluid
        />
        <small v-if="errors.groupId" class="iot-field-error">{{ errors.groupId }}</small>
      </div>
      <fieldset class="research-participants__groups">
        <legend class="iot-field__label">Группа исследования</legend>
        <div v-for="value in RESEARCH_GROUPS" :key="value" class="research-participants__radio">
          <RadioButton v-model="group" :input-id="`participants-${value}`" :value="value" />
          <label :for="`participants-${value}`">{{ RESEARCH_GROUP_LABELS[value] }}</label>
        </div>
      </fieldset>
      <Button
        type="submit"
        label="Включить студентов группы"
        icon="pi pi-user-plus"
        :loading="busy"
      />
    </form>
    <Message v-if="addError" severity="error" role="alert">{{ addError }}</Message>
    <Message v-if="result" severity="success" role="status">
      Включено: {{ result.added }}. Уже участвовали: {{ result.skipped }}.
    </Message>

    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="!participants" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="participants.length === 0"
      icon="pi pi-users"
      title="Участников пока нет"
      description="Включите учебные группы в экспериментальную и контрольную группы."
    />
    <div
      v-else
      class="research-participants__scroll"
      role="region"
      aria-label="Участники"
      tabindex="0"
    >
      <table class="research-participants__table">
        <caption class="iot-visually-hidden">
          Участники исследования: код, группа исследования, учебная группа, статус
        </caption>
        <thead>
          <tr>
            <th scope="col">Код</th>
            <th scope="col">Группа</th>
            <th scope="col">Учебная группа</th>
            <th v-if="showNames" scope="col">Ф. И. О.</th>
            <th scope="col">Статус</th>
            <th v-if="canEdit" scope="col"><span class="iot-visually-hidden">Действия</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in participants" :key="item.id">
            <th scope="row">{{ item.code }}</th>
            <td>
              <abbr :title="RESEARCH_GROUP_LABELS[item.group]">{{
                RESEARCH_GROUP_SHORT[item.group]
              }}</abbr>
            </td>
            <td>{{ item.academicGroup ?? '—' }}</td>
            <td v-if="showNames">{{ item.fullName ?? '—' }}</td>
            <td>
              <StatusBadge
                v-if="item.excludedAt"
                :label="`Исключён ${formatDate(item.excludedAt)}`"
                tone="neutral"
                icon="pi pi-minus-circle"
              />
              <StatusBadge
                v-else
                :label="`Включён ${formatDate(item.includedAt)}`"
                tone="success"
              />
            </td>
            <td v-if="canEdit">
              <Button
                v-if="!item.excludedAt"
                label="Исключить"
                severity="secondary"
                text
                size="small"
                :aria-label="`Исключить участника ${item.code}`"
                @click="
                  excluding = item;
                  excludeError = null;
                "
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ActionDialog
      :visible="!!excluding"
      title="Исключить участника"
      :message="`Участник ${excluding?.code ?? ''} больше не будет входить в расчёты. Запись и код сохранятся.`"
      confirm-label="Исключить"
      require-reason
      danger
      :busy="excludeBusy"
      :error="excludeError"
      @update:visible="(value) => !value && (excluding = null)"
      @confirm="exclude"
    />
  </section>
</template>

<style scoped>
.research-participants {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
  min-width: 0;
}

.research-participants h2 {
  margin: 0;
}

.research-participants__form {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) auto;
  align-items: end;
  gap: var(--iot-space-3);
}

.research-participants__groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-4);
  margin: 0;
  padding: 0;
  border: 0;
}

.research-participants__groups legend {
  width: 100%;
  margin-bottom: var(--iot-space-1);
}

.research-participants__radio {
  display: flex;
  align-items: center;
  gap: var(--iot-space-2);
}

.research-participants__scroll {
  /* Скрытая подпись таблицы позиционируется внутри контейнера, а не страницы (NFR-004). */
  position: relative;
  overflow-x: auto;
  max-width: 100%;
}

.research-participants__table {
  width: 100%;
  border-collapse: collapse;
}

.research-participants__table th,
.research-participants__table td {
  padding: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
  text-align: left;
}

.research-participants__table thead th {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

@media (max-width: 899px) {
  .research-participants__form {
    grid-template-columns: 1fr;
  }
}
</style>
