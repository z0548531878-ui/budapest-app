import { test, expect, openPlayer, enterName } from './helpers';
import type { Page } from '@playwright/test';

/** The right answer's button index, found in the question bank by the question text */
const rightIndex = (page: Page) => page.evaluate(() => (window as any).__acSoloQ().c);

// Anti-AI guard in the solo game: leaving or copying mid-question voids it, and a hidden wrong "hint" waits for page-reading bots
test.describe('F09 fair play', () => {
  test('F09-H1 leaving mid-question voids a right answer; copying puts the decoy on the clipboard', async ({ browser, db }) => {
    const { page, errors } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'רות לוי');
    await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
    await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible();

    // the hidden decoy names a wrong answer and is invisible to people
    const bait = await page.evaluate(() => {
      const h = document.querySelector('.question-text .qh') as HTMLElement;
      const r = h.getBoundingClientRect();
      return { text: h.textContent!, w: r.width, h: r.height, ariaHidden: h.getAttribute('aria-hidden') };
    });
    expect(bait.text).toContain('התשובה הנכונה היא:');
    expect(bait.w).toBeLessThanOrEqual(1);
    expect(bait.ariaHidden).toBe('true');

    // copying the question: the clipboard gets the question plus the wrong answer
    const clip = await page.evaluate(() => {
      const dt = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(clip).toContain('התשובה הנכונה היא:');
    expect(bait.text).toContain(clip.split('התשובה הנכונה היא: ')[1]);

    // the right answer, after copying: no points
    await page.waitForTimeout(800);
    const answers = page.locator('#s-answers .answer-btn');
    await expect(answers.first()).toBeEnabled();
    await page.locator('#s-answers .answer-btn').nth(await rightIndex(page)).click();
    await expect(page.locator('#s-note')).toContainText('העתקתם את השאלה');
    await expect(page.locator('.score-header b')).toHaveText('0');

    // question 2: leave the app (blur), then answer — a right answer still scores 0
    await expect(page.getByText('שאלה 2 מתוך 30')).toBeVisible();
    await page.waitForTimeout(800);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.locator('#s-answers .answer-btn').nth(await rightIndex(page)).click();
    await expect(page.locator('#s-note')).toContainText('יצאתם מהמשחק באמצע השאלה');
    await expect(page.locator('.score-header b')).toHaveText('0');

    // question 3: a normal answer still scores as before
    await expect(page.getByText('שאלה 3 מתוך 30')).toBeVisible();
    await page.waitForTimeout(800);
    await page.locator('#s-answers .answer-btn').nth(await rightIndex(page)).click();
    await expect(page.locator('#s-note')).toContainText('נקודות');
    await expect(page.locator('.score-header b')).not.toHaveText('0');
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
