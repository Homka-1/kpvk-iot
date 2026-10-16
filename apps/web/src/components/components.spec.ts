import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import EmptyState from './EmptyState.vue';
import ErrorState from './ErrorState.vue';
import MetricCard from './MetricCard.vue';
import ProgressIndicator from './ProgressIndicator.vue';
import StatusBadge, { type StatusTone } from './StatusBadge.vue';

const global = { plugins: [PrimeVue] };

describe('StatusBadge', () => {
  const tones: StatusTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];

  it.each(tones)('ТЗ п. 6.1: тон «%s» передаётся текстом и иконкой, не только цветом', (tone) => {
    const wrapper = mount(StatusBadge, { props: { label: 'Активна', tone } });
    expect(wrapper.text()).toBe('Активна');
    const icon = wrapper.find('i');
    expect(icon.classes()).toContain('pi');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('data-tone')).toBe(tone);
  });

  it('принимает собственную иконку', () => {
    const wrapper = mount(StatusBadge, { props: { label: 'Черновик', icon: 'pi pi-pencil' } });
    expect(wrapper.find('i').classes()).toContain('pi-pencil');
  });
});

describe('EmptyState', () => {
  it('FR-005: показывает пояснение и действие', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Нет данных', description: 'Диагностика ещё не проводилась.' },
      slots: { default: '<button>Назначить</button>' },
    });
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.find('h2').text()).toBe('Нет данных');
    expect(wrapper.text()).toContain('Диагностика ещё не проводилась.');
    expect(wrapper.find('button').text()).toBe('Назначить');
  });
});

describe('ErrorState', () => {
  it('NFR-005: понятное сообщение по умолчанию и роль alert', () => {
    const wrapper = mount(ErrorState, { global });
    expect(wrapper.attributes('role')).toBe('alert');
    expect(wrapper.text()).toContain('Не удалось загрузить данные');
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('NFR-005: кнопка «Повторить» вызывает событие retry', async () => {
    const wrapper = mount(ErrorState, { props: { retryable: true }, global });
    const button = wrapper.find('button');
    expect(button.text()).toContain('Повторить');
    await button.trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });
});

describe('MetricCard', () => {
  it('FR-005: без значения пишет «Нет данных», а не ноль', () => {
    const wrapper = mount(MetricCard, { props: { label: 'Активных ИОТ' } });
    expect(wrapper.text()).toContain('Нет данных');
    expect(wrapper.text()).not.toMatch(/\d/);
  });

  it('настоящий ноль показывается как ноль', () => {
    const wrapper = mount(MetricCard, { props: { label: 'Просроченных заданий', value: 0 } });
    expect(wrapper.find('.metric-card__value').text()).toBe('0');
  });

  it('число форматируется по-русски, единица выводится рядом', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Средний % выполнения', value: 1234.5, unit: '%' },
    });
    expect(wrapper.find('.metric-card__value').text().replace(/\s/g, ' ')).toBe('1 234,5 %');
  });
});

describe('ProgressIndicator', () => {
  it('показывает процент текстом и в атрибутах доступности', () => {
    const wrapper = mount(ProgressIndicator, { props: { label: 'Этап 2', value: 42.4 } });
    expect(wrapper.text()).toContain('42 %');
    const bar = wrapper.find('[role="progressbar"]');
    expect(bar.attributes('aria-valuenow')).toBe('42');
    expect(bar.attributes('aria-label')).toBe('Этап 2');
  });

  it('ограничивает значение диапазоном 0–100', () => {
    const wrapper = mount(ProgressIndicator, { props: { label: 'ИОТ', value: 150 } });
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
  });

  it('FR-005: без значения — «Нет данных», шкала не отображает 0 %', () => {
    const wrapper = mount(ProgressIndicator, { props: { label: 'ИОТ' } });
    expect(wrapper.text()).toContain('Нет данных');
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
  });
});
