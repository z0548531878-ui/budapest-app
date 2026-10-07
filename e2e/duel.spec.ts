import { test, expect, openPlayer, enterName } from './helpers';
import type { FakeFirestore } from './fake-firestore';
import type { Browser } from '@playwright/test';

async function enterLobby(browser: Browser, db: FakeFirestore, name: string) {
  const p = await openPlayer(browser, db);
  await p.page.getByRole('button', { name: /משחק ראש בראש/ }).click();
  await enterName(p.page, name);
  await expect(p.page.getByText('בחרו יריב')).toBeVisible();
  return p;
}

test.describe('F02 duel', () => {
  test('F02-H1 invite, accept, both see the same questions, scores and leaderboard agree', async ({ browser, db }) => {
    test.setTimeout(240_000);
    const a = await enterLobby(browser, db, 'אבי כהן');
    const b = await enterLobby(browser, db, 'בני לוי');
    await a.page.getByRole('button', { name: /הזמנה/ }).click();
    await expect(b.page.getByText('הזמנה לדו-קרב!')).toBeVisible();
    await b.page.getByRole('button', { name: /מאשרים/ }).click();

    for (let i = 1; i <= 30; i++) {
      await expect(a.page.getByText(`שאלה ${i} מתוך 30`)).toBeVisible({ timeout: 20_000 });
      await expect(b.page.getByText(`שאלה ${i} מתוך 30`)).toBeVisible();
      const qa = await a.page.locator('.question-text').innerText(), qb = await b.page.locator('.question-text').innerText();
      expect(qa).toBe(qb);
      await a.page.locator('#d-answers').getByRole('button').first().click();
      await b.page.locator('#d-answers').getByRole('button').last().click();
    }
    await expect(a.page.getByText('הדו-קרב הסתיים')).toBeVisible({ timeout: 20_000 });
    await expect(b.page.getByText('הדו-קרב הסתיים')).toBeVisible();
    const room = db.list('rooms').find(r => r.id.startsWith('D'))!.data;
    await expect(a.page.locator('.duel-final .dp').first().locator('.ds')).toHaveText(String(room.s1));
    await expect(b.page.locator('.duel-final .dp').first().locator('.ds')).toHaveText(String(room.s2));
    await expect.poll(() => db.list('duel_players_s1').length).toBe(2);
    for (const p of [a, b]) expect(p.errors).toEqual([]);
  });

  test('F02-E1 a declined invite tells the inviter and frees both players', async ({ browser, db }) => {
    const a = await enterLobby(browser, db, 'אבי כהן');
    const b = await enterLobby(browser, db, 'בני לוי');
    await a.page.getByRole('button', { name: /הזמנה/ }).click();
    await b.page.getByRole('button', { name: 'לא עכשיו' }).click();
    await expect(a.page.getByText(/לא אושרה/)).toBeVisible({ timeout: 10_000 });
    await expect(a.page.getByRole('button', { name: /הזמנה/ })).toBeEnabled();
  });

  test('F02-E2 leaving the lobby removes you from the other player\'s list', async ({ browser, db }) => {
    const a = await enterLobby(browser, db, 'אבי כהן');
    const b = await enterLobby(browser, db, 'בני לוי');
    await expect(a.page.getByText('בני לוי')).toBeVisible();
    await b.page.getByRole('button', { name: /מסך הבית/ }).click();
    await expect(a.page.getByText('בני לוי')).toBeHidden();
  });

  test('F02-E3 two players inviting each other at once end in one duel, not two', async ({ browser, db }) => {
    const a = await enterLobby(browser, db, 'אבי כהן');
    const b = await enterLobby(browser, db, 'בני לוי');
    await Promise.all([
      a.page.getByRole('button', { name: /הזמנה/ }).click(),
      b.page.getByRole('button', { name: /הזמנה/ }).click(),
    ]);
    await a.page.waitForTimeout(2000);
    const lobby = db.get('rooms/duel_lobby')!;
    expect(Object.keys(lobby.inv || {}).length).toBeLessThanOrEqual(1);
  });

  test('F02-E4 the opponent closes the app mid-duel: the other player is told and wins, not left waiting', async ({ browser, db }) => {
    test.setTimeout(90_000);
    const a = await enterLobby(browser, db, 'אבי כהן');
    const b = await enterLobby(browser, db, 'בני לוי');
    await a.page.getByRole('button', { name: /הזמנה/ }).click();
    await b.page.getByRole('button', { name: /מאשרים/ }).click();
    await expect(a.page.getByText('שאלה 1 מתוך 30')).toBeVisible({ timeout: 20_000 });
    await b.page.context().close();
    await expect(a.page.getByText(/עזב/)).toBeVisible({ timeout: 30_000 });
    await expect(a.page.getByText('הדו-קרב הסתיים')).toBeVisible();
    await expect(a.page.locator('.duel-result')).toContainText('ניצחתם');
  });
});
