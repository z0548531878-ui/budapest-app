import { test, expect, openPlayer, enterName, type Db } from './helpers';

const SOLO = 'solo_players_s5';

test.describe('F01 solo game', () => {
  test('F01-H1 register, play a full round, the score is saved to the leaderboard', async ({ browser, db }) => {
    const { page, errors } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'משה כהן');
    await expect(page.getByText('שלום,')).toBeVisible();
    expect(await db.get(`${SOLO}/משה כהן`)).toMatchObject({ name: 'משה כהן', best: 0 });

    await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
    let score = 0;
    for (let i = 1; i <= 30; i++) {
      await expect(page.getByText(`שאלה ${i} מתוך 30`)).toBeVisible();
      const answers = page.locator('#s-answers').getByRole('button');
      await expect(answers.first()).toBeEnabled();
      await answers.first().click();
      // read the result in one go, as soon as the answer registers: the next question replaces these nodes 1.1s later
      const got = await page.waitForFunction(() => {
        const b = document.querySelector('#s-answers .answer-btn') as HTMLButtonElement;
        return b && b.disabled && b;
      }).then(() => page.evaluate(() => {
        const b = document.querySelector('#s-answers .answer-btn') as HTMLButtonElement;
        return { disabled: b.disabled, right: b.classList.contains('correct'), note: document.getElementById('s-note')!.textContent! };
      }));
      expect(got.disabled).toBe(true);
      if (got.right) score += Number(got.note.match(/\+(\d+)/)![1]);
    }
    await expect(page.getByText(/סיימתם סבב/)).toBeVisible();
    await expect(page.locator('#s-final')).toHaveText(String(score));
    await expect.poll(async () => (await db.get(`${SOLO}/משה כהן`))?.games).toBe(1);
    expect(await db.get(`${SOLO}/משה כהן`)).toMatchObject({ best: score, bestQ: 30 });
    if (score > 0) await expect(page.locator('#s-end-lb .board-row.mine')).toContainText('משה כהן');
    // the round review lists all 30 questions with the right answer, and a wrong question can be reported
    await page.getByRole('button', { name: /התשובות של הסבב/ }).click();
    const review = page.getByRole('dialog', { name: /התשובות של הסבב/ });
    await expect(review.locator('.rv-row')).toHaveCount(30);
    await review.getByRole('button', { name: /יש כאן טעות/ }).first().click();
    await expect(review.getByText('תודה! הדיווח נשלח')).toBeVisible();
    await expect.poll(async () => (await db.get('rooms/reports'))?.list?.length).toBe(1);
    await page.screenshot({ path: test.info().outputPath('review.png') });
    await review.getByRole('button', { name: 'סגירה' }).click();
    await expect(review).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('F01-E1 a single name is rejected', async ({ browser, db }) => {
    const { page, dialogs } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'משה');
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toContain('שם ושם משפחה');
    expect(await db.list(SOLO)).toEqual([]);
  });

  test('F01-E2 double click on an answer scores it once', async ({ browser, db }) => {
    const { page } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'דנה לוי');
    await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
    await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible();
    // a frantic tap: every answer, twice, in the same instant
    const after = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('#s-answers .answer-btn')] as HTMLButtonElement[];
      bs.forEach(b => { b.click(); b.click(); });
      return { marked: document.querySelectorAll('#s-answers .correct, #s-answers .wrong').length, score: Number(document.querySelector('.score-header b')!.textContent) };
    });
    expect(after.marked).toBeLessThanOrEqual(2);
    expect(after.score).toBeLessThanOrEqual(32);
    await expect(page.getByText('שאלה 2 מתוך 30')).toBeVisible();
    await expect(page.locator('.score-header b')).toHaveText(String(after.score));
  });

  test('F01-E3 names with quotes and markup are shown as text, not HTML', async ({ browser, db }) => {
    await db.put(`${SOLO}/x`, { name: '<img src=x onerror="window.__pwned=1">', best: 500, bestQ: 30 });
    const { page } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'אבי "הגדול" כץ');
    await expect(page.locator('.solo-lb')).toContainText('<img src=x');
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  });

  test('F01-E4 the timer runs out: no points, the next question follows', async ({ browser, db }) => {
    test.setTimeout(60_000);
    const { page } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'רות בן דוד');
    await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
    await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible();
    await expect(page.locator('#s-note')).toHaveText(/נגמר הזמן/, { timeout: 14_000 });
    await expect(page.locator('.score-header b')).toHaveText('0');
    await expect(page.getByText('שאלה 2 מתוך 30')).toBeVisible();
  });

  test('F01-E5 quit mid-round asks first, returns home and saves nothing', async ({ browser, db }) => {
    const { page, dialogs } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'יוסי מזרחי');
    await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
    await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible();
    await page.locator('#s-answers').getByRole('button').first().click();
    await page.getByRole('button', { name: /יציאה למסך הבית/ }).click();
    // quitting after answering asks first, so a stray tap can't throw the round away
    await expect.poll(() => dialogs.find(d => d.includes('לצאת מהסבב'))).toBeTruthy();
    await expect(page.getByRole('button', { name: /משחק עצמאי/ })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await db.get(`${SOLO}/יוסי מזרחי`)).toMatchObject({ games: 0 });
  });

  test('F01-E6 a returning player skips registration and keeps the record', async ({ browser, db }) => {
    const { page } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'שרה אברהם');
    await expect(page.getByText('שלום,')).toBeVisible();
    await page.reload();
    await expect(page.getByText('שרה אברהם')).toBeVisible();
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await expect(page.getByRole('button', { name: /התחילו סבב חדש/ })).toBeVisible();
  });
});
