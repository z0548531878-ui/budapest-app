// Solo: a question can be replaced twice per round, without losing points.
import { test, expect, openPlayer, enterName } from './helpers';

test('F13-H1 two question swaps per round', async ({ browser, db }) => {
  const { page, errors } = await openPlayer(browser, db);
  await page.getByRole('button', { name: /משחק עצמאי/ }).click();
  await enterName(page, 'מחליף שאלות');
  await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
  await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible();
  const qText = () => page.evaluate(() => { const im = document.querySelector('.q-card img, .q-colors') as any; return document.querySelector('.question-text')!.firstChild!.textContent + '|' + (im ? (im.getAttribute('data-u') || im.getAttribute('src') || im.outerHTML) : ''); }); // image questions share the same text
  const seen = new Set([await qText()]);
  for (const left of [2, 1]) {
    const b = page.locator('#s-skipq');
    await expect(b).toContainText(`נשארו ${left}`);
    await b.click();
    await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible();
    await expect.poll(qText).not.toBe([...seen].pop());
    const t = await qText(); expect(seen.has(t)).toBe(false); seen.add(t);
  }
  await expect(page.locator('#s-skipq')).toHaveCount(0);
  await expect(page.locator('.score-header b')).toHaveText('0');
  // the round goes on as usual
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('q-reading'))).toBe(false);
  await page.waitForTimeout(150);
  await page.locator('#s-answers .answer-btn').first().click();
  await expect(page.getByText('שאלה 2 מתוך 30')).toBeVisible();
  await expect(page.locator('#s-skipq')).toHaveCount(0);
  expect(errors).toEqual([]);
});
