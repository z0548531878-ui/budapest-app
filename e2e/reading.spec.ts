// One second to read the question before the clock starts; answers can't be pressed in that second.
import { test, expect, openPlayer, enterName } from './helpers';

test('F12-H1 the clock waits one second after the question appears', async ({ browser, db }) => {
  const { page, errors } = await openPlayer(browser, db);
  await page.getByRole('button', { name: /משחק עצמאי/ }).click();
  await enterName(page, 'קורא איטי');
  await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
  await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible();
  const t0 = Date.now();
  // in the reading second: full clock, answers not pressable
  const early = await page.evaluate(() => {
    const b = document.querySelector('#s-answers .answer-btn') as HTMLButtonElement; b.click();
    return { reading: document.body.classList.contains('q-reading'), num: document.getElementById('s-timer-num')!.textContent, marked: document.querySelectorAll('#s-answers .correct, #s-answers .wrong').length };
  });
  expect(Date.now() - t0).toBeLessThan(900);
  expect(early).toEqual({ reading: true, num: '15', marked: 0 });
  // after the second the clock runs and answering works
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('q-reading')), { timeout: 3000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => Number(document.getElementById('s-timer-num')!.textContent)), { timeout: 4000 }).toBeLessThan(15);
  await page.locator('#s-answers .answer-btn').first().click();
  await expect(page.locator('#s-answers .correct')).toHaveCount(1);
  expect(errors).toEqual([]);
});
