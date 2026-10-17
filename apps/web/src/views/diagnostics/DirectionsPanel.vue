<script setup lang="ts">
import { type DiagnosticDirectionDto, directionFormSchema } from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { useForm } from 'vee-validate';
import { onMounted, ref } from 'vue';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { useList } from '@/views/disciplines/useList';

/**
 * Диагностические направления — настраиваемые разделы п. 4.4 ТЗ. Пять направлений из ТЗ
 * создаются при установке; можно добавлять свои и переименовывать.
 */
const list = useList<DiagnosticDirectionDto>(() => '/diagnostic-directions');
const editorOpen = ref(false);
const editing = ref<DiagnosticDirectionDto | null>(null);
const serverError = ref<string | null>(null);

const { defineField, errors, handleSubmit, isSubmitting, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(directionFormSchema),
});
const [code, codeAttrs] = defineField('code');
const [name, nameAttrs] = defineField('name');
const [sortOrder] = defineField('sortOrder');

onMounted(list.load);

function edit(direction: DiagnosticDirectionDto | null): void {
  editing.value = direction;
  serverError.value = null;
  const last = list.items.value.at(-1)?.sortOrder ?? 0;
  resetForm({
    values: direction
      ? { code: direction.code, name: direction.name, sortOrder: direction.sortOrder }
      : { code: '', name: '', sortOrder: last + 10 },
  });
  editorOpen.value = true;
}

const onSubmit = handleSubmit(async (values) => {
  serverError.value = null;
  try {
    await api(
      editing.value ? `/diagnostic-directions/${editing.value.id}` : '/diagnostic-directions',
      { method: editing.value ? 'PATCH' : 'POST', body: values },
    );
    editorOpen.value = false;
    void list.load();
  } catch (error) {
    if (error instanceof ApiError) setErrors(error.fields);
    serverError.value =
      error instanceof ApiError ? error.message : 'Не удалось сохранить направление';
  }
});
</script>

<template>
  <div class="directions">
    <div class="directions__toolbar">
      <Button label="Добавить направление" icon="pi pi-plus" @click="edit(null)" />
    </div>
    <ErrorState v-if="list.error.value" :message="list.error.value" retryable @retry="list.load" />
    <p v-else-if="!list.loaded.value" role="status">Загрузка…</p>
    <EmptyState
      v-else-if="list.items.value.length === 0"
      icon="pi pi-sitemap"
      title="Направлений нет"
      description="Добавьте диагностические направления, чтобы группировать методики."
    />
    <ul v-else class="directions__list">
      <li v-for="direction in list.items.value" :key="direction.id" class="iot-card direction">
        <div>
          <p class="direction__name">{{ direction.name }}</p>
          <p class="direction__code">Код: {{ direction.code }}</p>
        </div>
        <Button
          label="Изменить"
          icon="pi pi-pencil"
          size="small"
          text
          :aria-label="`Изменить направление «${direction.name}»`"
          @click="edit(direction)"
        />
      </li>
    </ul>

    <Dialog
      v-model:visible="editorOpen"
      modal
      :header="editing ? 'Изменение направления' : 'Новое направление'"
      :style="{ width: '30rem' }"
      :breakpoints="{ '575px': '95vw' }"
    >
      <form class="iot-form" novalidate @submit="onSubmit">
        <div class="iot-field">
          <label for="direction-name">Название</label>
          <InputText
            id="direction-name"
            v-model="name"
            v-bind="nameAttrs"
            :invalid="!!errors.name"
            fluid
          />
          <small v-if="errors.name" class="iot-field-error">{{ errors.name }}</small>
        </div>
        <div class="iot-field">
          <label for="direction-code">Код</label>
          <InputText
            id="direction-code"
            v-model="code"
            v-bind="codeAttrs"
            :invalid="!!errors.code"
            fluid
          />
          <small v-if="errors.code" class="iot-field-error">{{ errors.code }}</small>
        </div>
        <div class="iot-field">
          <label for="direction-order">Порядок в списке</label>
          <InputNumber
            v-model="sortOrder"
            input-id="direction-order"
            :min="0"
            :max="10000"
            :use-grouping="false"
            fluid
          />
          <small v-if="errors.sortOrder" class="iot-field-error">{{ errors.sortOrder }}</small>
        </div>
        <Message v-if="serverError" severity="error" :closable="false">{{ serverError }}</Message>
        <div class="iot-form-buttons">
          <Button
            type="button"
            label="Отмена"
            severity="secondary"
            text
            @click="editorOpen = false"
          />
          <Button type="submit" label="Сохранить" :loading="isSubmitting" />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.directions {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.directions__toolbar {
  display: flex;
  justify-content: flex-end;
}

.directions__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.direction {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.direction p {
  margin: 0;
}

.direction__name {
  color: var(--iot-color-heading);
  font-weight: 600;
}

.direction__code {
  color: var(--iot-color-muted);
  font-size: 0.8125rem;
}
</style>
