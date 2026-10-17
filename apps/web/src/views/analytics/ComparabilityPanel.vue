<script setup lang="ts">
import {
  COMPARABILITY_NOTE_MAX,
  type ComparabilityQuestionnaireDto,
  type VersionComparabilityDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { reactive, ref } from 'vue';
import { api, ApiError } from '@/api/http';
import ActionDialog from '@/components/ActionDialog.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/utils/format';

/**
 * Сопоставимость версий методик (UC-06): исследователь утверждает, что замеры двух версий
 * можно сравнивать по шкалам с одинаковым кодом. Без утверждения повторный замер по другой
 * версии в сравнение с первичным не входит.
 */
defineProps<{ questionnaires: ComparabilityQuestionnaireDto[]; canManage: boolean }>();
const emit = defineEmits<{ updated: [questionnaire: ComparabilityQuestionnaireDto] }>();

interface Draft {
  versionAId: string | null;
  versionBId: string | null;
  note: string;
  error: string | null;
  fields: Record<string, string>;
  busy: boolean;
}
const drafts = reactive<Record<string, Draft>>({});

function draftFor(id: string): Draft {
  drafts[id] ??= {
    versionAId: null,
    versionBId: null,
    note: '',
    error: null,
    fields: {},
    busy: false,
  };
  return drafts[id];
}

function versionOptions(questionnaire: ComparabilityQuestionnaireDto) {
  return questionnaire.versions.map((version) => ({
    id: version.id,
    label:
      version.status === 'PUBLISHED'
        ? `Версия ${version.versionNumber} (действующая)`
        : `Версия ${version.versionNumber}`,
  }));
}

async function approve(questionnaire: ComparabilityQuestionnaireDto): Promise<void> {
  const draft = draftFor(questionnaire.id);
  draft.error = null;
  draft.fields = {};
  if (!draft.versionAId || !draft.versionBId) {
    draft.fields = {
      ...(draft.versionAId ? {} : { versionAId: 'Выберите версию' }),
      ...(draft.versionBId ? {} : { versionBId: 'Выберите версию' }),
    };
    return;
  }
  draft.busy = true;
  try {
    const updated = await api<ComparabilityQuestionnaireDto>('/questionnaire-comparabilities', {
      method: 'POST',
      body: { versionAId: draft.versionAId, versionBId: draft.versionBId, note: draft.note },
    });
    drafts[questionnaire.id] = {
      ...draftFor(questionnaire.id),
      versionAId: null,
      versionBId: null,
      note: '',
    };
    emit('updated', updated);
  } catch (caught) {
    draft.error =
      caught instanceof ApiError ? caught.message : 'Не удалось утвердить сопоставимость';
    if (caught instanceof ApiError) draft.fields = caught.fields;
  } finally {
    draft.busy = false;
  }
}

const revokeOpen = ref(false);
const revokeTarget = ref<VersionComparabilityDto | null>(null);
const revokeBusy = ref(false);
const revokeError = ref<string | null>(null);

function askRevoke(pair: VersionComparabilityDto): void {
  revokeTarget.value = pair;
  revokeError.value = null;
  revokeOpen.value = true;
}

async function revoke(reason: string): Promise<void> {
  if (!revokeTarget.value) return;
  revokeBusy.value = true;
  revokeError.value = null;
  try {
    const updated = await api<ComparabilityQuestionnaireDto>(
      `/questionnaire-comparabilities/${revokeTarget.value.id}/revoke`,
      { method: 'POST', body: { reason } },
    );
    emit('updated', updated);
    revokeOpen.value = false;
  } catch (caught) {
    revokeError.value = caught instanceof ApiError ? caught.message : 'Не удалось отозвать';
  } finally {
    revokeBusy.value = false;
  }
}
</script>

<template>
  <section class="comparability" aria-labelledby="comparability-title">
    <h2 id="comparability-title" class="comparability__title">Сопоставимость версий методик</h2>
    <p class="comparability__hint">
      Повторный замер сравнивается с первичным, если пройдена та же версия методики или версия,
      сопоставимость которой утверждена. Шкалы сравниваются по коду.
    </p>
    <article
      v-for="questionnaire in questionnaires"
      :key="questionnaire.id"
      class="iot-card comparability__item"
    >
      <div class="comparability__head">
        <h3 class="comparability__name">{{ questionnaire.title }}</h3>
        <StatusBadge v-if="questionnaire.isDemo" label="Демо" tone="warning" icon="pi pi-flag" />
      </div>
      <p class="comparability__muted">
        Опубликованные версии:
        {{ questionnaire.versions.map((version) => version.versionNumber).join(', ') }}
      </p>
      <ul v-if="questionnaire.comparabilities.length > 0" class="comparability__pairs">
        <li
          v-for="pair in questionnaire.comparabilities"
          :key="pair.id"
          class="comparability__pair"
        >
          <div>
            <i class="pi pi-link" aria-hidden="true" />
            <strong>
              Версии {{ pair.versionA.versionNumber }} и {{ pair.versionB.versionNumber }}
              сопоставимы
            </strong>
            <span class="comparability__muted">
              — утверждено {{ formatDate(pair.approvedAt) }}
              <template v-if="pair.approvedBy">, {{ pair.approvedBy.fullName }}</template>
            </span>
            <p v-if="pair.note" class="comparability__note">{{ pair.note }}</p>
          </div>
          <Button
            v-if="canManage"
            label="Отозвать"
            icon="pi pi-times"
            size="small"
            severity="secondary"
            text
            :aria-label="`Отозвать сопоставимость версий ${pair.versionA.versionNumber} и ${pair.versionB.versionNumber}`"
            @click="askRevoke(pair)"
          />
        </li>
      </ul>
      <p v-else class="comparability__muted">Сопоставимых пар версий нет.</p>
      <form
        v-if="canManage && questionnaire.versions.length > 1"
        class="iot-form comparability__form"
        novalidate
        @submit.prevent="approve(questionnaire)"
      >
        <div class="comparability__fields">
          <div class="iot-field">
            <label :id="`cmp-a-${questionnaire.id}-label`" :for="`cmp-a-${questionnaire.id}`">
              Первая версия
            </label>
            <Select
              v-model="draftFor(questionnaire.id).versionAId"
              :input-id="`cmp-a-${questionnaire.id}`"
              :aria-labelledby="`cmp-a-${questionnaire.id}-label`"
              :options="versionOptions(questionnaire)"
              option-label="label"
              option-value="id"
              placeholder="Выберите версию"
              :invalid="!!draftFor(questionnaire.id).fields.versionAId"
              fluid
            />
            <small v-if="draftFor(questionnaire.id).fields.versionAId" class="iot-field-error">
              {{ draftFor(questionnaire.id).fields.versionAId }}
            </small>
          </div>
          <div class="iot-field">
            <label :id="`cmp-b-${questionnaire.id}-label`" :for="`cmp-b-${questionnaire.id}`">
              Вторая версия
            </label>
            <Select
              v-model="draftFor(questionnaire.id).versionBId"
              :input-id="`cmp-b-${questionnaire.id}`"
              :aria-labelledby="`cmp-b-${questionnaire.id}-label`"
              :options="versionOptions(questionnaire)"
              option-label="label"
              option-value="id"
              placeholder="Выберите версию"
              :invalid="!!draftFor(questionnaire.id).fields.versionBId"
              fluid
            />
            <small v-if="draftFor(questionnaire.id).fields.versionBId" class="iot-field-error">
              {{ draftFor(questionnaire.id).fields.versionBId }}
            </small>
          </div>
        </div>
        <div class="iot-field">
          <label :for="`cmp-note-${questionnaire.id}`">Обоснование</label>
          <Textarea
            :id="`cmp-note-${questionnaire.id}`"
            v-model="draftFor(questionnaire.id).note"
            rows="2"
            :maxlength="COMPARABILITY_NOTE_MAX"
            placeholder="Например: ключи и шкалы не менялись, изменены только формулировки"
            fluid
          />
        </div>
        <Message v-if="draftFor(questionnaire.id).error" severity="error" role="alert">
          {{ draftFor(questionnaire.id).error }}
        </Message>
        <div class="iot-form-buttons">
          <Button
            type="submit"
            label="Утвердить сопоставимость"
            icon="pi pi-check"
            :loading="draftFor(questionnaire.id).busy"
          />
        </div>
      </form>
    </article>
    <ActionDialog
      v-model:visible="revokeOpen"
      title="Отзыв сопоставимости"
      message="Замеры этих версий перестанут сравниваться между собой. Результаты прохождений не изменятся."
      confirm-label="Отозвать"
      require-reason
      danger
      :busy="revokeBusy"
      :error="revokeError"
      @confirm="revoke"
    />
  </section>
</template>

<style scoped>
.comparability {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-3);
}

.comparability__title {
  margin: 0;
  font-size: 1.125rem;
}

.comparability__hint,
.comparability__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.comparability__item {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.comparability__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.comparability__name {
  margin: 0;
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.comparability__pairs {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.comparability__pair {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--iot-space-2);
  padding: var(--iot-space-2) var(--iot-space-3);
  border-radius: var(--iot-radius);
  background: var(--iot-color-info-bg);
}

.comparability__note {
  margin: var(--iot-space-1) 0 0;
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.comparability__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--iot-space-3);
}
</style>
