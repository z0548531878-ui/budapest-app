// Photos load from Wikimedia's image server at a standard size; if that copy fails, the original link is used.
import { test, expect, openPlayer, enterName } from './helpers';

test('F16-H1 photos use the fast copy, and fall back to the original link', async ({ browser, db }) => {
  const fast: string[] = [];
  const { page, errors } = await openPlayer(browser, db, { setup: async c => {
    await c.route(/upload\.wikimedia\.org/, r => { fast.push(r.request().url()); return r.fulfill({ status: 404, body: '' }); });
  } });
  await page.getByRole('button', { name: /משחק עצמאי/ }).click();
  await enterName(page, 'בודק תמונות');
  await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
  for (let i = 1; i <= 30; i++) {
    await expect(page.getByText(`שאלה ${i} מתוך 30`)).toBeVisible({ timeout: 20000 });
    const ph = page.locator('.q-photo img');
    if (await ph.count()) {
      await expect.poll(() => ph.evaluate((e: HTMLImageElement) => e.src === e.dataset.u && e.complete && e.naturalWidth > 0)).toBe(true);
      await expect(page.locator('.q-photo.err')).toHaveCount(0);
      break;
    }
    await page.locator('#s-answers .answer-btn').first().click();
  }
  expect(fast.length).toBeGreaterThan(0);
  expect(fast[0]).toMatch(/\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/.+\/500px-/);
  expect(errors).toEqual([]);
});
