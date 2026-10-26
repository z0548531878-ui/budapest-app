import { test, expect, openPlayer, enterName } from './helpers';
import type { Page } from '@playwright/test';

/** The right answer's button index, found in the question bank by the question text */
const rightIndex = (page: Page) => page.evaluate(() => (window as any).__acSoloQ().c);

// The anti-AI guard was removed (it hurt real players); these tests make sure nothing of it is left
test.describe('F09 fair play', () => {
  test('F09-H1 no anti-AI traps: leaving the app mid-question still counts, no hidden hint in the page', async ({ browser, db }) => {
    const { page, errors } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'רות לוי');
    await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
    await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible();
    expect(await page.locator('.qh').count()).toBe(0);
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('q-reading'))).toBe(false);
    // a notification pulls the shade down: the page loses focus for a moment
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(200);
    const c = await rightIndex(page);
    await page.locator('#s-answers .answer-btn').nth(c).click();
    await expect(page.locator('#s-note')).not.toContainText('לא נספרת');
    expect(Number(await page.locator('.score-header b').textContent())).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('F09-E1 test names never reach the leaderboard', async ({ browser, db }) => {
    await db.put('solo_players_s7/טסט טסט', { name: 'טסט טסט', best: 900, bestQ: 30 });
    await db.put('solo_players_s7/test user', { name: 'test user', best: 880, bestQ: 30 });
    await db.put('solo_players_s7/דוד כהן', { name: 'דוד כהן', best: 400, bestQ: 30 });
    const { page } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'רות לוי');
    await expect(page.getByText('דוד כהן').first()).toBeVisible();
    await expect(page.getByText('טסט טסט')).toHaveCount(0);
    await expect(page.getByText('test user')).toHaveCount(0);
  });
});
