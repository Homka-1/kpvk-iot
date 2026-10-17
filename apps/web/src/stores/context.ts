import { type DisciplineDto, type GroupDto, Permission } from '@iot/shared';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { api } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

const STORAGE_KEY = 'iot.context';

function readSaved(): { groupId: string | null; disciplineId: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return {
      groupId: typeof saved.groupId === 'string' ? saved.groupId : null,
      disciplineId: typeof saved.disciplineId === 'string' ? saved.disciplineId : null,
    };
  } catch {
    return { groupId: null, disciplineId: null };
  }
}

/**
 * Рабочий контекст из шапки (п. 4.1 ТЗ): выбранные группа и дисциплина. Списки — только доступные
 * пользователю (FR-002, проверяет сервер). Выбор запоминается в браузере и сбрасывается,
 * если группа или дисциплина стали недоступны.
 */
export const useContextStore = defineStore('context', () => {
  const auth = useAuthStore();
  const groups = ref<GroupDto[]>([]);
  const disciplines = ref<DisciplineDto[]>([]);
  const saved = readSaved();
  const groupId = ref<string | null>(saved.groupId);
  const disciplineId = ref<string | null>(saved.disciplineId);

  const group = computed(() => groups.value.find((item) => item.id === groupId.value) ?? null);
  const discipline = computed(
    () => disciplines.value.find((item) => item.id === disciplineId.value) ?? null,
  );

  watch([groupId, disciplineId], () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ groupId: groupId.value, disciplineId: disciplineId.value }),
      );
    } catch {
      // Хранилище браузера недоступно — выбор действует до перезагрузки страницы.
    }
  });

  async function load(): Promise<void> {
    const canGroups =
      auth.hasPermission(Permission.GROUPS_MANAGE) || auth.hasPermission(Permission.STUDENTS_READ);
    const canDisciplines = auth.hasPermission(Permission.DISCIPLINES_READ);
    const [groupList, disciplineList] = await Promise.all([
      canGroups ? api<GroupDto[]>('/groups') : Promise.resolve([]),
      canDisciplines ? api<DisciplineDto[]>('/disciplines') : Promise.resolve([]),
    ]);
    groups.value = groupList;
    disciplines.value = disciplineList;
    if (groupId.value && !group.value) groupId.value = null;
    if (disciplineId.value && !discipline.value) disciplineId.value = null;
  }

  return { groups, disciplines, groupId, disciplineId, group, discipline, load };
});
