import { expect, type Page, test } from '@playwright/test';

/**
 * A real run, in a real browser.
 *
 * This is the only place the whole stack is exercised together: an actual WebGL
 * context, React Three Fiber's render loop driving the simulation, the bridge's
 * throttling, and the global keyboard capture. Every layer below has unit tests;
 * none of them can tell you the scene got a context.
 *
 * These tests type what is on screen rather than a fixed string, because the
 * words are drawn from a seeded pool and asserting on a particular one would be
 * asserting on the seed.
 */

const STAGE = 'The road ahead, the hazards on it, and the runner';

async function startRun(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: /Map 1: Neighborhood Dash/ }).click();
  // Twice, and deliberately: the briefing's Start run opens the game screen, and
  // the game screen's own Start run is the click that unlocks audio and begins
  // the simulation. Autoplay policy is why that second gesture exists.
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.getByRole('img', { name: STAGE }).waitFor();
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();
}

/**
 * The word currently on screen.
 *
 * Read from the visually-hidden label rather than from the scene: the word is
 * drawn in WebGL, and the hidden label exists precisely so that something other
 * than a pair of eyes can find it.
 */
async function currentWord(page: Page): Promise<string> {
  const text = await page.getByText(/^Current word: /).textContent();

  return text?.replace(/^Current word:\s*/, '') ?? '';
}

/** Waits for a hazard's challenge to appear, and returns its word. */
async function waitForWord(page: Page): Promise<string> {
  await expect
    .poll(async () => (await currentWord(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);

  return currentWord(page);
}

test('starts a run and renders the scene', async ({ page }) => {
  await startRun(page);

  await expect(page.getByRole('img', { name: STAGE })).toBeVisible();

  // The scene is WebGL, so "did it render" is asked of the canvas element the
  // renderer created rather than of anything React put on the page.
  await expect(page.locator('canvas')).toBeVisible();
});

test('there is no typing box to click', async ({ page }) => {
  await startRun(page);

  // The PDF is explicit: no visible gameplay text input. The player types and
  // it works, wherever focus happens to be.
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText(/just type/i)).toBeVisible();
});

test('typing the word clears the hazard and the road goes quiet', async ({ page }) => {
  await startRun(page);

  const word = await waitForWord(page);
  expect(word.length).toBeGreaterThan(0);

  await page.keyboard.type(word, { delay: 40 });

  // The challenge is over, so there is nothing to type until the next hazard.
  await expect.poll(async () => currentWord(page), { timeout: 15_000 }).not.toBe(word);
});

test('the HUD moves while the run is under way', async ({ page }) => {
  await startRun(page);

  const progress = page.getByRole('progressbar', { name: 'To finish' });
  const before = await progress.getAttribute('aria-valuenow');

  // Stats reach React at ~10Hz, so this is a poll rather than a single read.
  await expect
    .poll(async () => progress.getAttribute('aria-valuenow'), { timeout: 15_000 })
    .not.toBe(before);
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

test('Ctrl+Enter restarts from anywhere', async ({ page }) => {
  await startRun(page);

  const progress = page.getByRole('progressbar', { name: 'To finish' });
  await expect
    .poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await page.keyboard.press('Control+Enter');

  // A restart is a fresh run: the road starts again from the beginning.
  await expect
    .poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 10_000 })
    .toBeLessThan(20);
});

test('quitting a run returns to map selection', async ({ page }) => {
  await startRun(page);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to maps' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Choose a map' })).toBeVisible();
});

test('a player who types nothing crashes into the first hazard', async ({ page }) => {
  await startRun(page);

  // Doing nothing has to end the run, or the hazards mean nothing. The shell
  // routes to the results screen the moment it does, so that is where the
  // outcome is read from rather than from the run itself.
  await expect(page.getByText('Crashed').first()).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
