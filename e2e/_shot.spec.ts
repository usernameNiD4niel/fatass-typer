import { test } from '@playwright/test';

const OUT = 'C:/Users/DANIEL~1/AppData/Local/Temp/claude/C--Users-Daniel-Rey-Documents-Repository-fatass-typer/cf784b82-969e-4836-a77e-890eaf44eacd/scratchpad';

test('obstacle and jump', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: /Map 1: Neighborhood Dash/ }).click();
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.getByRole('img').waitFor();
  await page.getByRole('button', { name: 'Start run' }).click();

  // Run until an obstacle prompt appears, screenshotting the approach.
  for (let i = 0; i < 60; i += 1) {
    const kind = await page.getByText(/Obstacle/).count();
    if (kind > 0) {
      await page.screenshot({ path: `${OUT}/obstacle.png` });
      const label = await page.getByRole('textbox').getAttribute('aria-label');
      const prompt = (label ?? '').replace(/^Type:\s*/, '');
      await page.getByRole('textbox').pressSequentially(prompt, { delay: 15 });
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${OUT}/jump.png` });
      break;
    }
    const label = await page.getByRole('textbox').getAttribute('aria-label');
    const prompt = (label ?? '').replace(/^Type:\s*/, '');
    if (prompt && prompt !== 'Type the prompt') {
      await page.getByRole('textbox').pressSequentially(prompt, { delay: 12 });
    }
    await page.waitForTimeout(250);
  }
});
