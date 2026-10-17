import { ref } from 'vue';
import { api, ApiError } from '@/api/http';

/** Загрузка списка для панели раздела: данные, состояние загрузки и понятная ошибка (NFR-005). */
export function useList<T>(
  path: () => string,
  query: () => Record<string, string | null> = () => ({}),
) {
  const items = ref<T[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      items.value = await api<T[]>(path(), { query: query() });
      loaded.value = true;
    } catch (failure) {
      error.value = failure instanceof ApiError ? failure.message : 'Не удалось загрузить данные';
    } finally {
      loading.value = false;
    }
  }

  return { items, loaded, loading, error, load };
}

/** Выполнение действия со строкой: ошибка показывается в диалоге подтверждения. */
export function useAction() {
  const busy = ref(false);
  const error = ref<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    busy.value = true;
    error.value = null;
    try {
      await action();
      return true;
    } catch (failure) {
      error.value = failure instanceof ApiError ? failure.message : 'Не удалось выполнить действие';
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { busy, error, run };
}
