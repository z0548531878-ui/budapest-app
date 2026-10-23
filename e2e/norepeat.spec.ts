import { test, expect, openPlayer, enterName } from './helpers';

test.describe('F10 no repeats', () => {
  test('F10-H1 fifteen rounds in a row never repeat a question, a picture or a concept — also on a new phone', async ({ browser, db }) => {
    const { page } = await openPlayer(browser, db);
    await page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(page, 'רון לוי');
    await expect(page.getByText('שלום,')).toBeVisible();
    const keys = new Set<string>(), concepts = new Set<string>();
    for (let r = 0; r < 15; r++) {
      // half way, the player moves to a "new phone": local memory is wiped, the cloud copy must carry on
      if (r === 8) {
        await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('trivia_solo_seen')).forEach(k => localStorage.removeItem(k)));
        await page.evaluate(() => (window as any).__soloSync?.());
      }
      const round = await page.evaluate(() => (window as any).__soloPick());
      expect(round.length).toBe(30);
      expect(round.filter((q: any) => q.img).length).toBe(13);
      for (const q of round) {
        expect(keys.has(q.k), `round ${r + 1} repeats a question`).toBe(false);
        keys.add(q.k);
        if (q.c) { expect(concepts.has(q.c), `round ${r + 1} repeats ${q.c}`).toBe(false); concepts.add(q.c); }
      }
    }
  });
});
