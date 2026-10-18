import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { mountWithApp } from '@/testing/mount';
import DateInput from './DateInput.vue';

describe('DateInput', () => {
  it('показывает дату как «дд/мм/гггг», а значение хранит как YYYY-MM-DD', async () => {
    const { wrapper } = await mountWithApp(DateInput, {
      props: { inputId: 'd', modelValue: '2026-09-01' },
    });
    const input = wrapper.find<HTMLInputElement>('#d');
    expect(input.element.value).toBe('01/09/2026');
    expect(input.attributes('placeholder')).toBe('дд/мм/гггг');

    await input.setValue('20/12/2026');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['2026-12-20']);
  });

  it('пустое значение — пустое поле', async () => {
    const { wrapper } = await mountWithApp(DateInput, { props: { inputId: 'd', modelValue: '' } });
    expect(wrapper.find<HTMLInputElement>('#d').element.value).toBe('');
  });
});
