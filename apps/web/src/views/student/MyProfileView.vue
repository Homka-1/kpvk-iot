<script setup lang="ts">
import {
  formatFullName,
  INTERESTS_MAX,
  interestsFormSchema,
  type OwnProfileDto,
} from '@iot/shared';
import { toTypedSchema } from '@vee-validate/zod';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { useForm } from 'vee-validate';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import { formatDate } from '@/utils/format';

/**
 * «Мой профиль» студента (п. 2.3, 3.2 ТЗ): собственные данные, дисциплины и преподаватели,
 * интересы, которые студент указывает сам, и наблюдения, открытые ему преподавателем.
 * Служебные заметки преподавателя сервер студенту не отдаёт (FR-016).
 */
const route = useRoute();
const profile = ref<OwnProfileDto | null>(null);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saved = ref(false);
const busy = ref(false);

const form = useForm({ validationSchema: toTypedSchema(interestsFormSchema) });
const [interests, interestsAttrs] = form.defineField('interests');

function apply(value: OwnProfileDto): void {
  profile.value = value;
  form.resetForm({ values: { interests: value.interests ?? '' } });
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    apply(await api<OwnProfileDto>('/cabinet/profile'));
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Не удалось загрузить профиль';
  }
}

const save = form.handleSubmit(async (values) => {
  busy.value = true;
  saveError.value = null;
  saved.value = false;
  try {
    apply(await api<OwnProfileDto>('/cabinet/profile', { method: 'PATCH', body: values }));
    saved.value = true;
  } catch (error) {
    if (error instanceof ApiError) form.setErrors(error.fields);
    saveError.value = error instanceof ApiError ? error.message : 'Не удалось сохранить';
  } finally {
    busy.value = false;
  }
});

onMounted(load);
</script>

<template>
  <div class="iot-page my-profile">
    <h1>{{ route.meta.title }}</h1>
    <ErrorState v-if="loadError" :message="loadError" retryable @retry="load" />
    <p v-else-if="!profile" role="status">Загрузка…</p>
    <template v-else>
      <section class="iot-card" aria-labelledby="my-profile-data">
        <h2 id="my-profile-data" class="my-profile__title">{{ formatFullName(profile) }}</h2>
        <dl class="my-profile__list">
          <div>
            <dt>Код участника</dt>
            <dd>{{ profile.participantCode }}</dd>
          </div>
          <div>
            <dt>Группа</dt>
            <dd>
              <template v-if="profile.group">
                {{ profile.group.name }} · {{ profile.group.course }} курс
              </template>
              <template v-else>Нет данных</template>
            </dd>
          </div>
          <div v-if="profile.group">
            <dt>Специальность</dt>
            <dd>{{ profile.group.specialty }}</dd>
          </div>
        </dl>
      </section>

      <section class="iot-card" aria-labelledby="my-profile-disciplines">
        <h2 id="my-profile-disciplines" class="my-profile__title">Мои дисциплины</h2>
        <ul v-if="profile.disciplines.length" class="my-profile__items">
          <li v-for="item in profile.disciplines" :key="item.id">
            <strong>{{ item.name }}</strong>
            <span class="my-profile__muted">
              {{ item.teachers.map((teacher) => teacher.fullName).join(', ') }}
            </span>
          </li>
        </ul>
        <p v-else class="my-profile__muted">Дисциплины группе пока не назначены</p>
      </section>

      <section class="iot-card" aria-labelledby="my-profile-interests">
        <h2 id="my-profile-interests" class="my-profile__title">Мои интересы</h2>
        <form class="iot-form" novalidate @submit="save">
          <div class="iot-field">
            <label for="my-interests">Чем вы интересуетесь</label>
            <Textarea
              id="my-interests"
              v-model="interests"
              v-bind="interestsAttrs"
              rows="3"
              :maxlength="INTERESTS_MAX"
              :invalid="!!form.errors.value.interests"
              fluid
              @input="saved = false"
            />
            <small class="iot-field-hint">
              Например: программирование, дизайн, спорт. Преподаватель учтёт интересы при подборе
              заданий.
            </small>
            <small v-if="form.errors.value.interests" class="iot-field-error">
              {{ form.errors.value.interests }}
            </small>
          </div>
          <Message v-if="saveError" severity="error" role="alert">{{ saveError }}</Message>
          <Message v-if="saved" severity="success" role="status">Интересы сохранены</Message>
          <div class="iot-form-buttons">
            <Button type="submit" label="Сохранить" :loading="busy" />
          </div>
        </form>
      </section>

      <section aria-labelledby="my-profile-observations">
        <h2 id="my-profile-observations" class="my-profile__title">Отзывы преподавателей</h2>
        <EmptyState
          v-if="profile.observations.length === 0"
          icon="pi pi-comment"
          title="Отзывов пока нет"
          description="Здесь появятся наблюдения и рекомендации, которыми с вами поделится преподаватель."
        />
        <ul v-else class="my-profile__items">
          <li v-for="item in profile.observations" :key="item.id" class="iot-card">
            <span class="my-profile__muted">
              {{ formatDate(item.observedAt) }} · {{ item.author.fullName }}
              <template v-if="item.discipline">· {{ item.discipline.name }}</template>
            </span>
            <p class="my-profile__text">{{ item.text }}</p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.my-profile {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.my-profile h1 {
  margin: 0;
}

.my-profile__title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1.0625rem;
  overflow-wrap: anywhere;
}

.my-profile__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
}

.my-profile__list dt {
  color: var(--iot-color-muted);
  font-size: 0.75rem;
}

.my-profile__list dd {
  margin: 0;
}

.my-profile__items {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-profile__items li {
  display: flex;
  flex-direction: column;
}

.my-profile__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.my-profile__text {
  margin: var(--iot-space-2) 0 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
