import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import type { Component } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { routes } from '@/router';

/** Маршрутизатор приложения на памяти — для модульных тестов компонентов. */
export function createTestRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes });
}

/** Монтирует компонент с PrimeVue и маршрутизатором, предварительно перейдя по `path`. */
export async function mountWithApp<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> & { path?: string } = {},
) {
  const { path = '/', global, ...rest } = options;
  const router = createTestRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, {
    ...rest,
    global: { ...global, plugins: [PrimeVue, router, ...(global?.plugins ?? [])] },
  } as ComponentMountingOptions<C>);
  return { wrapper, router };
}
