import { test, expect } from '@playwright/test';

test('keyboard users receive a visible focus indicator', async ({ page }) => {
  await page.goto('/');
  const createButton = page.getByRole('button', { name: /Create Your Archive/i }).first();
  await expect(createButton).toBeVisible();
  await createButton.focus();

  const focusStyle = await createButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(focusStyle.style).not.toBe('none');
  expect(parseFloat(focusStyle.width)).toBeGreaterThan(0);
});

test('reduced-motion preference disables cursor-driven theme animation work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const backdrop = page.locator('[data-theme-backdrop="true"]').first();
  await expect(backdrop).toBeAttached();
  const before = await backdrop.evaluate((element) =>
    (element as HTMLElement).style.getPropertyValue('--cursor-x')
  );

  await page.mouse.move(20, 20);
  await page.mouse.move(280, 180);
  await page.waitForTimeout(100);

  const after = await backdrop.evaluate((element) =>
    (element as HTMLElement).style.getPropertyValue('--cursor-x')
  );
  expect(before).toBe('50%');
  expect(after).toBe('50%');
});

test('core landing page stays within a phone viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Create Your Archive/i }).first()).toBeVisible();

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
});
