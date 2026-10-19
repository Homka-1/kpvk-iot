import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, fakeUser, mockSession } from './support/session';

test.describe('отчёты', () => {
  test('FR-078, FR-080, NFR-004: отчёт по ИОТ скачивается в выбранном формате', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['teacher']));
    let requested: URL | null = null;
    await page.route(/\/api\/reports\/trajectories/, (route) => {
      requested = new URL(route.request().url());
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="report-trajectories-2026-10-20.pdf"',
        },
        body: '%PDF-1.4',
      });
    });
    await page.goto('/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Отчёты' })).toBeVisible();
    for (const title of [
      'Индивидуальный отчёт студента',
      'Отчёт по группе',
      'Отчёт по реализации ИОТ',
      'Отчёт по диагностике',
    ]) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    // Без группы в шапке индивидуальный и групповой отчёты недоступны с пояснением.
    await expect(page.getByText('Выберите группу в шапке.').first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByText('XLSX (Excel)').click();
    const download = page.waitForEvent('download');
    await page
      .getByRole('region', { name: 'Отчёт по реализации ИОТ' })
      .getByRole('button', { name: /Сформировать/ })
      .click();
    expect((await download).suggestedFilename()).toBe('report-trajectories-2026-10-20.pdf');
    expect(requested!.searchParams.get('format')).toBe('xlsx');
    await expect(page.getByText('Файл сформирован.')).toBeVisible();
  });
});
