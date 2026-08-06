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

const STAGE = 'The road ahead, the traffic beside it, and the runner';

async function startRun(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: /Map 1: Neighborhood Dash/ }).click();
  /*
   * Once. It used to be twice: the briefing's Start run opened the game screen
   * and the game screen carried its own, on the theory that autoplay policy
   * needed a second gesture there.
   *
   * It does not. The briefing click gives the document sticky user activation,
   * which is what `AudioContext.resume()` actually requires — so the second
   * button was asking the player to confirm a decision they had already made,
   * on a screen that looked exactly like the game.
   */
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.getByRole('img', { name: STAGE }).waitFor();
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

/** Waits for a word to appear, and returns it. */
async function waitForWord(page: Page): Promise<string> {
  await expect
    .poll(async () => (await currentWord(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);

  return currentWord(page);
}

/**
 * Plays badly on purpose, until the chaser arrives.
 *
 * A wrong character costs ground immediately and a lapsed word costs more, so
 * holding down nonsense loses a run in a fraction of the time idling does —
 * which keeps this inside a sane test timeout.
 */
async function mistypeUntilCaught(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (
      await page
        .getByText('Caught')
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;
    await page.keyboard.type('qqqq', { delay: 15 });
    await page.waitForTimeout(150);
  }
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

test('typing the word replaces it with the next one', async ({ page }) => {
  await startRun(page);

  const word = await waitForWord(page);
  expect(word.length).toBeGreaterThan(0);

  await page.keyboard.type(word, { delay: 40 });

  // Finishing one puts the next one up immediately: the road is never silent.
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

test('a player who cannot type is caught', async ({ page }) => {
  test.setTimeout(120_000);
  await startRun(page);

  /*
   * Typing badly has to end the run, or the chaser means nothing. It is the
   * only way to lose now, and it is cumulative rather than instant — so this
   * mistypes steadily rather than idling, which is both faster and closer to
   * what losing actually looks like.
   */
  await mistypeUntilCaught(page);

  // The shell routes to the results screen the moment the run ends, so that is
  // where the outcome is read from rather than from the run itself.
  await expect(page.getByText('Caught').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('progress survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await startRun(page);

  // Lose the run, which is what records it against the profile.
  await mistypeUntilCaught(page);
  await expect(page.getByText('Caught').first()).toBeVisible({ timeout: 60_000 });

  /*
   * The reload is the assertion.
   *
   * Everything about persistence can be made to pass in a unit test against a
   * fake IndexedDB; what a fake cannot tell you is whether the real database
   * survives the page going away, which is the entire feature. So this walks
   * back to the briefing after a genuine reload and reads the attempt count.
   */
  await page.reload();

  /*
   * Both dismissals are optional, and which ones appear is itself the point.
   * A profile that persisted has already seen the tutorial, so the modal may
   * legitimately not come back — asserting on its absence would be asserting on
   * how "seen" happens to be stored rather than on progress surviving.
   */
  for (const name of ['Skip', 'Got it']) {
    const control = page.getByRole('button', { name });
    if (await control.isVisible().catch(() => false)) await control.click();
  }

  // "Maps" rather than "Start": the menu offers "Continue" once there is
  // progress to continue, and depending on which label is present would make
  // this test depend on the menu's copy instead of on the database.
  await page.getByRole('button', { name: 'Maps' }).click();
  await page.getByRole('button', { name: /Map 1: Neighborhood Dash/ }).click();

  await expect(page.getByText('Attempts')).toBeVisible();
  await expect(page.getByText('You have not run this map yet.')).toBeHidden();
});
