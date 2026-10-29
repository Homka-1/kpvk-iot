<script setup lang="ts">
import {
  formatFullName,
  type ObservationDto,
  Permission,
  type StudentHistoryItemDto,
  type StudentProfileDto,
} from '@iot/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '@/api/http';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { formatDate, formatDateTime } from '@/utils/format';
import { setDocumentTitle } from '@/utils/title';
import { NO_DATA, profileBadge, supportBadge, trajectoryBadge } from './labels';
import ObservationDialog from './ObservationDialog.vue';
import StudentMotivationTab from '@/views/profiles/StudentMotivationTab.vue';
import StudentAssignmentsTab from '@/views/assignments/StudentAssignmentsTab.vue';
import StudentTrajectoriesTab from '@/views/trajectories/StudentTrajectoriesTab.vue';
import StudentSupportTab from '@/views/feedback/StudentSupportTab.vue';
import StudentGrades from '@/views/grades/StudentGrades.vue';
import StudentControlResults from '@/views/achievements/StudentControlResults.vue';
import StudentLessonJournal from '@/views/lessons/StudentLessonJournal.vue';
import StudentDiagnosticsTab from './StudentDiagnosticsTab.vue';
import StudentDialog from './StudentDialog.vue';

/**
 * Профиль студента (п. 4.3, 6.3 ТЗ): верхняя карточка и семь вкладок. Данные собираются из модулей
 * (FR-012); вкладки модулей, которые ещё не наполнены, показывают пояснение вместо пустых
 * показателей (FR-005). Служебные наблюдения видны только сотрудникам — это проверяет сервер.
 */
const route = useRoute();
const auth = useAuthStore();
const context = useContextStore();
const studentId = computed(() => String(route.params.id));
const canObserve = computed(() => auth.hasPermission(Permission.OBSERVATIONS_MANAGE));
const canManage = computed(() => auth.hasPermission(Permission.STUDENTS_MANAGE));
const canTrajectories = computed(() => auth.hasPermission(Permission.TRAJECTORIES_MANAGE));
const canFeedback = computed(() => auth.hasPermission(Permission.FEEDBACK_MANAGE));

const TABS = [
  'general',
  'diagnostics',
  'motivation',
  'trajectory',
  'assignments',
  'support',
  'history',
];
/** Вкладка из адреса (`?tab=motivation`) — переход из других разделов. */
const initialTab = () => {
  const value = String(route.query.tab ?? '');
  return TABS.includes(value) ? value : 'general';
};
const tab = ref(initialTab());
const profile = ref<StudentProfileDto | null>(null);
const loadError = ref<string | null>(null);
const observations = ref<ObservationDto[] | null>(null);
const observationsError = ref<string | null>(null);
const history = ref<StudentHistoryItemDto[] | null>(null);
const historyError = ref<string | null>(null);
const observationOpen = ref(false);
const editing = ref<ObservationDto | null>(null);
const manageOpen = ref(false);

/** Дисциплины группы, которые ведёт текущий пользователь: только к ним можно привязать наблюдение. */
const ownDisciplines = computed(
  () =>
    profile.value?.disciplines.filter((item) =>
      item.teachers.some((teacher) => teacher.id === auth.user?.id),
    ) ?? [],
);

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

async function loadProfile(): Promise<void> {
  loadError.value = null;
  try {
    profile.value = await api<StudentProfileDto>(`/students/${studentId.value}/profile`);
  } catch (error) {
    loadError.value = message(error, 'Не удалось загрузить профиль студента');
  }
}

async function loadObservations(): Promise<void> {
  observationsError.value = null;
  try {
    observations.value = await api<ObservationDto[]>(`/students/${studentId.value}/observations`);
  } catch (error) {
    observationsError.value = message(error, 'Не удалось загрузить наблюдения');
  }
}

async function loadHistory(): Promise<void> {
  historyError.value = null;
  try {
    history.value = await api<StudentHistoryItemDto[]>(`/students/${studentId.value}/history`);
  } catch (error) {
    historyError.value = message(error, 'Не удалось загрузить историю');
  }
}

watch(
  studentId,
  () => {
    profile.value = null;
    observations.value = null;
    history.value = null;
    tab.value = initialTab();
    void loadProfile();
    void loadObservations();
  },
  { immediate: true },
);

// Фамилия и имя во вкладке браузера, чтобы различать открытые профили.
watch(profile, (value) => {
  if (value) setDocumentTitle(`${value.lastName} ${value.firstName}`);
});

watch(tab, (value) => {
  if (value === 'history' && history.value === null) void loadHistory();
});

function addObservation(): void {
  editing.value = null;
  observationOpen.value = true;
}

function editObservation(item: ObservationDto): void {
  editing.value = item;
  observationOpen.value = true;
}

function onObservationSaved(): void {
  tab.value = 'support';
  void loadObservations();
  history.value = null;
}

function onMotivationChanged(): void {
  void loadProfile();
  history.value = null;
}

function onStudentChanged(): void {
  void loadProfile();
  history.value = null;
  void context.load().catch(() => undefined);
}
</script>

<template>
  <div class="iot-page profile">
    <RouterLink to="/students" class="profile__back">
      <i class="pi pi-arrow-left" aria-hidden="true" /> Студенты
    </RouterLink>

    <ErrorState v-if="loadError" :message="loadError" retryable @retry="loadProfile" />
    <p v-else-if="!profile" role="status">Загрузка…</p>
    <template v-else>
      <section class="iot-card profile__header" aria-labelledby="profile-name">
        <div class="profile__heading">
          <div class="profile__title">
            <h1 id="profile-name">{{ formatFullName(profile) }}</h1>
            <span class="profile__muted">Код участника: {{ profile.participantCode }}</span>
          </div>
          <StatusBadge v-if="profile.archivedAt" label="В архиве" tone="neutral" icon="pi pi-box" />
          <StatusBadge v-else v-bind="supportBadge(profile.supportStatus)" />
        </div>
        <p class="profile__muted">
          <template v-if="profile.group">
            Группа {{ profile.group.name }} · {{ profile.group.course }} курс ·
            {{ profile.group.specialty }}
          </template>
          <template v-else>Группа не указана</template>
        </p>
        <dl class="profile__facts">
          <div>
            <dt>Мотивационный профиль</dt>
            <dd>
              <StatusBadge
                v-if="profile.motivationProfile"
                v-bind="profileBadge(profile.motivationProfile)"
              />
              <span v-else class="profile__muted">{{ NO_DATA }}</span>
            </dd>
          </div>
          <div>
            <dt>Текущая ИОТ</dt>
            <dd>
              <template v-if="profile.currentTrajectory">
                {{ profile.currentTrajectory.disciplineName }}
                <StatusBadge v-bind="trajectoryBadge(profile.currentTrajectory.status)" />
              </template>
              <span v-else class="profile__muted">Нет ИОТ</span>
            </dd>
          </div>
        </dl>
        <div v-if="canObserve || canManage || canTrajectories" class="profile__actions">
          <RouterLink
            v-if="canTrajectories && !profile.archivedAt"
            :to="{ name: 'trajectory-new', query: { studentId } }"
            class="p-button p-component p-button-outlined"
          >
            <i class="pi pi-directions" aria-hidden="true" /> Создать ИОТ
          </RouterLink>
          <Button
            v-if="canManage"
            label="Управление карточкой"
            icon="pi pi-cog"
            severity="secondary"
            outlined
            @click="manageOpen = true"
          />
          <Button
            v-if="canObserve && !profile.archivedAt"
            label="Добавить наблюдение"
            icon="pi pi-plus"
            @click="addObservation"
          />
        </div>
      </section>

      <Message v-if="profile.archivedAt" severity="secondary">
        В архиве с {{ formatDateTime(profile.archivedAt) }}. Причина: {{ profile.archiveReason }}.
      </Message>

      <Tabs v-model:value="tab" scrollable>
        <TabList>
          <Tab value="general">Общие сведения</Tab>
          <Tab value="diagnostics">Диагностика</Tab>
          <Tab value="motivation">Мотивационный профиль</Tab>
          <Tab value="trajectory">Моя ИОТ</Tab>
          <Tab value="assignments">Задания</Tab>
          <Tab value="support">Сопровождение</Tab>
          <Tab value="history">История</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="general">
            <div class="profile__columns">
              <section class="iot-card" aria-labelledby="profile-general">
                <h2 id="profile-general" class="profile__section-title">Учёба</h2>
                <dl class="profile__list">
                  <div>
                    <dt>Группа</dt>
                    <dd>{{ profile.group?.name ?? NO_DATA }}</dd>
                  </div>
                  <div>
                    <dt>Курс</dt>
                    <dd>{{ profile.group?.course ?? NO_DATA }}</dd>
                  </div>
                  <div>
                    <dt>Специальность</dt>
                    <dd>{{ profile.group?.specialty ?? NO_DATA }}</dd>
                  </div>
                  <div>
                    <dt>Интересы (указывает студент)</dt>
                    <dd :class="{ profile__muted: !profile.interests }">
                      {{ profile.interests ?? 'Студент пока не указал интересы' }}
                    </dd>
                  </div>
                </dl>
              </section>
              <section class="iot-card" aria-labelledby="profile-disciplines">
                <h2 id="profile-disciplines" class="profile__section-title">
                  Дисциплины и преподаватели
                </h2>
                <ul v-if="profile.disciplines.length" class="profile__plain-list">
                  <li v-for="item in profile.disciplines" :key="item.id">
                    <strong>{{ item.name }}</strong>
                    <span class="profile__muted">
                      {{ item.teachers.map((teacher) => teacher.fullName).join(', ') }}
                    </span>
                  </li>
                </ul>
                <p v-else class="profile__muted">Группе пока не назначены дисциплины</p>
              </section>
              <section class="iot-card" aria-labelledby="profile-enrollments">
                <h2 id="profile-enrollments" class="profile__section-title">История групп</h2>
                <ul class="profile__plain-list">
                  <li v-for="item in profile.enrollments" :key="item.id">
                    <strong>{{ item.group.name }}</strong>
                    <span class="profile__muted">
                      с {{ formatDate(item.startsAt) }}
                      {{ item.endsAt ? `по ${formatDate(item.endsAt)}` : 'по настоящее время' }}
                      <template v-if="item.reason">· причина: {{ item.reason }}</template>
                    </span>
                  </li>
                </ul>
              </section>
            </div>
          </TabPanel>

          <TabPanel value="diagnostics">
            <div class="profile__stack">
              <StudentDiagnosticsTab :student-id="studentId" @changed="history = null" />
              <StudentGrades :student-id="studentId" />
              <StudentControlResults :source="`/students/${studentId}/control-results`" />
            </div>
          </TabPanel>
          <TabPanel value="motivation">
            <StudentMotivationTab
              :student-id="studentId"
              :archived="!!profile.archivedAt"
              @changed="onMotivationChanged"
            />
          </TabPanel>
          <TabPanel value="trajectory">
            <StudentTrajectoriesTab :student-id="studentId" :archived="!!profile.archivedAt" />
          </TabPanel>
          <TabPanel value="assignments">
            <StudentAssignmentsTab :student-id="studentId" />
          </TabPanel>

          <TabPanel value="support">
            <div class="profile__stack">
              <section aria-labelledby="profile-observations">
                <div class="profile__section-head">
                  <h2 id="profile-observations" class="profile__section-title">
                    Педагогические наблюдения
                  </h2>
                  <Button
                    v-if="canObserve && !profile.archivedAt"
                    label="Добавить"
                    icon="pi pi-plus"
                    size="small"
                    outlined
                    @click="addObservation"
                  />
                </div>
                <ErrorState
                  v-if="observationsError"
                  :message="observationsError"
                  retryable
                  @retry="loadObservations"
                />
                <p v-else-if="!observations" role="status">Загрузка…</p>
                <EmptyState
                  v-else-if="observations.length === 0"
                  icon="pi pi-pencil"
                  title="Наблюдений пока нет"
                  description="Записывайте наблюдения с датой: они помогают видеть динамику, а не только последние результаты."
                />
                <ul v-else class="profile__observations">
                  <li v-for="item in observations" :key="item.id" class="iot-card">
                    <div class="profile__observation-meta">
                      <span>{{ formatDate(item.observedAt) }} · {{ item.author.fullName }}</span>
                      <span v-if="item.discipline">· {{ item.discipline.name }}</span>
                      <StatusBadge
                        v-if="item.visibility === 'INTERNAL'"
                        label="Видно только преподавателям"
                        tone="neutral"
                        icon="pi pi-lock"
                      />
                      <StatusBadge v-else label="Видно студенту" tone="info" icon="pi pi-eye" />
                    </div>
                    <p class="profile__observation-text">{{ item.text }}</p>
                    <Button
                      v-if="item.canEdit"
                      label="Изменить"
                      icon="pi pi-pencil"
                      size="small"
                      text
                      @click="editObservation(item)"
                    />
                  </li>
                </ul>
              </section>
              <StudentLessonJournal :student-id="studentId" />
              <StudentSupportTab
                v-if="canFeedback"
                :student-id="studentId"
                :archived="!!profile.archivedAt"
                @changed="history = null"
              />
            </div>
          </TabPanel>

          <TabPanel value="history">
            <ErrorState
              v-if="historyError"
              :message="historyError"
              retryable
              @retry="loadHistory"
            />
            <p v-else-if="!history" role="status">Загрузка…</p>
            <EmptyState
              v-else-if="history.length === 0"
              icon="pi pi-history"
              title="Событий пока нет"
            />
            <ol v-else class="profile__history">
              <li v-for="item in history" :key="item.id">
                <span class="profile__muted">{{ formatDateTime(item.at) }}</span>
                <strong>{{ item.label }}</strong>
                <span v-if="item.actor" class="profile__muted">{{ item.actor.fullName }}</span>
                <span v-if="item.reason">Причина: {{ item.reason }}</span>
              </li>
            </ol>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <ObservationDialog
        v-model:visible="observationOpen"
        :student-id="studentId"
        :observation="editing"
        :disciplines="ownDisciplines"
        @saved="onObservationSaved"
      />
      <StudentDialog
        v-if="canManage"
        v-model:visible="manageOpen"
        :student-id="studentId"
        :groups="context.groups"
        @changed="onStudentChanged"
      />
    </template>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.profile__back {
  display: inline-flex;
  align-items: center;
  gap: var(--iot-space-1);
  align-self: flex-start;
}

.profile__header {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
}

.profile__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--iot-space-2);
}

.profile__title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile__title h1 {
  margin: 0;
  overflow-wrap: anywhere;
}

.profile__muted {
  margin: 0;
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.profile__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--iot-space-2) var(--iot-space-5);
  margin: 0;
}

.profile__facts dt,
.profile__list dt {
  color: var(--iot-color-muted);
  font-size: 0.75rem;
}

.profile__facts dd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-1);
  margin: 0;
  font-weight: 600;
}

.profile__actions,
.profile__section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-2);
}

.profile__actions {
  justify-content: flex-end;
}

.profile__section-head {
  justify-content: space-between;
  margin-bottom: var(--iot-space-2);
}

.profile__section-title {
  margin: 0 0 var(--iot-space-2);
  font-size: 1rem;
}

.profile__section-head .profile__section-title {
  margin: 0;
}

.profile__columns {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: var(--iot-space-3);
}

.profile__list {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
}

.profile__list dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.profile__plain-list,
.profile__observations,
.profile__history {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.profile__plain-list li,
.profile__history li {
  display: flex;
  flex-direction: column;
}

.profile__history li {
  padding-bottom: var(--iot-space-2);
  border-bottom: 1px solid var(--iot-color-border);
}

.profile__stack {
  display: flex;
  flex-direction: column;
  gap: var(--iot-space-4);
}

.profile__observation-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--iot-space-1) var(--iot-space-2);
  color: var(--iot-color-muted);
  font-size: 0.875rem;
}

.profile__observation-text {
  margin: var(--iot-space-2) 0 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
