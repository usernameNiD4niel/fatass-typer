import { expect, type Page, test } from '@playwright/test';

/**
 * Getting around the game, by keyboard only (spec §12).
 *
 * Every interaction here goes through Tab and Enter rather than a click. That
 * is the point: the game demands a keyboard anyway, and a menu that can only be
 * operated with a mouse fails the one accessibility requirement a typing game
 * has no excuse for missing.
 */

/** Skips the splash and dismisses the first-run tutorial. */
async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
}

test('boots to the main menu', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('progressbar', { name: 'Loading progress' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Typing Chase' })).toBeVisible();

  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(page.getByRole('dialog', { name: 'How Typing Chase works' })).toBeVisible();
});

test('walks from the menu into a run using only the keyboard', async ({ page }) => {
  await boot(page);

  // Tab to Start and press it. The menu's first control is the one a player
  // most likely wants, which is what makes this reachable in one hop.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: 'Choose a map' })).toBeVisible();

  await page.getByRole('button', { name: /Map 1: Neighborhood Dash/ }).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Neighborhood Dash' })).toBeVisible();

  await page.getByRole('button', { name: 'Start run' }).press('Enter');
  await expect(page.getByRole('img', { name: 'The runner and the chasing dogs' })).toBeVisible();
});

test('reaches a locked map with the keyboard to read why it is locked', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Maps' }).click();

  const locked = page.getByRole('button', { name: /Map 2: Downtown Sprint/ });

  // `aria-disabled`, not `disabled`: the unlock requirement is written on this
  // card, so it has to stay in the tab order (spec §12).
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await locked.focus();
  await expect(locked).toBeFocused();
  // Every locked map states its own requirement, so this is the first of several.
  await expect(page.getByText(/to unlock/).first()).toBeVisible();
});

test('opens settings and applies a theme', async ({ page }) => {
  await boot(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Maps' })).toBeVisible();
});

test('opens statistics and comes back', async ({ page }) => {
  await boot(page);

  await page.getByRole('button', { name: 'Statistics' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Statistics' })).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Maps' })).toBeVisible();
});

test('explains itself below the minimum width instead of squeezing', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');

  await expect(page.getByText(/1024/)).toBeVisible();
});
