import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@iot/shared';
import HomeView from './HomeView.vue';

describe('HomeView', () => {
  it('показывает название системы на русском', () => {
    const wrapper = mount(HomeView);
    expect(wrapper.find('h1').text()).toBe(APP_NAME);
  });
});
