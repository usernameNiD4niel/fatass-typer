import { expect, type Page, test } from '@playwright/test';

/**
 * A real run, in a real browser (spec §19).
 *
 * This is the only place the whole stack is exercised together: an actual 2D
 * canvas context, `requestAnimationFrame`, the fixed-timestep loop, the bridge's
 * throttling, and a live typing field. Every layer below has unit tests; none
 * of them can tell you the canvas got a context.
 *
 * These tests type what is on screen rather than a fixed string, because the
 * prompts are drawn from a seeded pool and asserting on a particular word would
 * be asserting on the seed.
 */

async function startRun(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: /Map 1: Neighborhood Dash/ }).click();
  // Twice, and deliberately: the briefing's Start run opens the game screen,
  // and the game screen's own Start run is the click that unlocks audio and
  // begins the simulation. Autoplay policy is why that second gesture exists.
  await page.getByRole('button', { name: 'Start run' }).click();
  await page
    .getByRole('img', { name: 'The runner, the track ahead, and the chasing dogs' })
    .waitFor();
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByRole('textbox')).toBeEnabled();
}

/** The prompt currently on screen, from the field's own accessible name. */
async function currentPrompt(page: Page): Promise<string> {
  const label = await page.getByRole('textbox').getAttribute('aria-label');

  return label?.replace(/^Type:\s*/, '') ?? '';
}

test('starts a run and drives the canvas', async ({ page }) => {
  await startRun(page);

  await expect(
    page.getByRole('img', { name: 'The runner, the track ahead, and the chasing dogs' }),
  ).toBeVisible();
  // The fatal-error path is what a browser without a 2D context takes. Seeing
  // it here would mean the renderer never started.
  await expect(page.getByText(/did not provide a 2D canvas context/)).toHaveCount(0);

  // The typing field takes focus on its own: the player should be able to type
  // the moment the run begins, without hunting for the box.
  await expect(page.getByRole('textbox')).toBeFocused();
});

test('typing the prompt completes it and brings up another', async ({ page }) => {
  await startRun(page);

  const first = await currentPrompt(page);
  expect(first.length).toBeGreaterThan(0);

  await page.getByRole('textbox').pressSequentially(first, { delay: 25 });

  // A completed prompt is replaced, so the field's label changes.
  await expect.poll(async () => currentPrompt(page), { timeout: 10_000 }).not.toBe(first);
});

test('the HUD moves while the run is under way', async ({ page }) => {
  await startRun(page);

  const progress = page.getByRole('progressbar', { name: 'To finish' });
  const before = await progress.getAttribute('aria-valuenow');

  const prompt = await currentPrompt(page);
  await page.getByRole('textbox').pressSequentially(prompt, { delay: 25 });

  // Stats reach React at ~10Hz, so this is a poll rather than a single read.
  await expect.poll(async () => progress.getAttribute('aria-valuenow')).not.toBe(before);
});

test('Escape pauses and resumes', async ({ page }) => {
  await startRun(page);

  await page.keyboard.press('Escape');
  const overlay = page.getByRole('dialog', { name: 'Paused' });
  await expect(overlay).toBeVisible();

  // Scoped to the overlay: the HUD's own pause control also reads "Resume"
  // while the run is held.
  await overlay.getByRole('button', { name: 'Resume' }).click();
  await expect(overlay).toHaveCount(0);
});

test('Ctrl+Enter restarts from inside the typing field', async ({ page }) => {
  await startRun(page);

  const prompt = await currentPrompt(page);
  await page.getByRole('textbox').pressSequentially(prompt.slice(0, 2), { delay: 25 });
  await expect(page.getByRole('textbox')).not.toHaveValue('');

  await page.getByRole('textbox').press('Control+Enter');

  // A restart is a fresh run: whatever was typed is gone.
  await expect(page.getByRole('textbox')).toHaveValue('');
});

test('quitting a run returns to map selection', async ({ page }) => {
  await startRun(page);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to maps' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Choose a map' })).toBeVisible();
});

test('the dogs eventually catch a player who types nothing', async ({ page }) => {
  await startRun(page);

  // Map 1 is forgiving, but not infinitely: doing nothing has to end the run,
  // or the chase means nothing.
  await expect(page.getByText('Caught by the dogs').first()).toBeVisible({ timeout: 40_000 });
});
