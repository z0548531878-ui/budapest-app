import { test, expect, openPlayer, enterName, type Player, type Db } from './helpers';

import type { Browser } from '@playwright/test';

async function openHost(browser: Browser, db: Db) {
  const host = await openPlayer(browser, db, { answers: ['2026'] });
  await host.page.getByRole('button', { name: /כניסת מנחה משחק/ }).click();
  await expect(host.page.getByRole('button', { name: /התחל משחק/ })).toBeVisible();
  return host;
}
async function joinGroup(browser: Browser, db: Db, name: string) {
  const p = await openPlayer(browser, db);
  await p.page.getByRole('button', { name: /משחק קבוצתי/ }).click();
  await enterName(p.page, name);
  await expect(p.page.locator('.wait-title')).toBeVisible();
  return p;
}
async function roomCode(db: Db) { return (await db.get('rooms/current'))!.code as string; }
async function answerFirst(p: Player) {
  const b = p.page.locator('#p-answers').getByRole('button').first();
  await expect(b).toBeEnabled();
  await b.click();
}

test.describe('F03 group game', () => {
  test('F03-H1 host opens a room, players join, play, everyone gets scored', async ({ browser, db }) => {
    const host = await openHost(browser, db);
    const a = await joinGroup(browser, db, 'אלי כהן');
    const b = await joinGroup(browser, db, 'בתיה לוי');
    await expect(host.page.locator('.host-names')).toContainText('אלי כהן');
    await expect(host.page.locator('.host-names')).toContainText('בתיה לוי');
    const code = await roomCode(db);

    await host.page.getByRole('button', { name: /התחל משחק/ }).click();
    // a new lobby opens for the next game while this one runs
    await expect.poll(() => roomCode(db)).not.toBe(code);

    for (let q = 1; q <= 3; q++) {
      await expect(a.page.getByText(new RegExp(`שאלה ${q} מתוך`))).toBeVisible({ timeout: 20_000 });
      await answerFirst(a); await answerFirst(b);
      // everyone answered → the answer is revealed without waiting for the clock
      await expect(host.page.locator('.reveal-card')).toBeVisible({ timeout: 5_000 });
    }
    const players = await db.list(`rooms/${code}/players`);
    expect(players.every(p => p.data.answered === 3)).toBe(true);

    await host.page.locator('#h-endgame').click();
    await expect(a.page.getByText('סוף המשחק')).toBeVisible();
    await expect(host.page.locator('#h-restart')).toBeVisible();
    const total = ((await db.list(`rooms/${code}/players`)).find(p => p.data.name === 'אלי כהן')!.data.score) || 0;
    await expect(a.page.locator('.se-score')).toHaveText(String(total));
    for (const p of [host, a, b]) expect(p.errors).toEqual([]);
    expect(db.failures, 'Firestore writes that failed').toEqual([]);
  });

  test('F03-E1 a player dropped from the lobby (phone asleep) still answers: the game must not freeze', async ({ browser, db }) => {
    const host = await openHost(browser, db);
    const a = await joinGroup(browser, db, 'אלי כהן');
    const sleepy = await joinGroup(browser, db, 'נתן ישנוני');
    const code = await roomCode(db);
    await expect(host.page.locator('.host-names')).toContainText('נתן ישנוני');
    // the host prunes players whose heartbeat stopped (phone locked > 90s): simulate that prune
    const sleepyId = (await db.list(`rooms/${code}/players`)).find(p => p.data.name === 'נתן ישנוני')!.id;
    await db.remove(`rooms/${code}/players/${sleepyId}`);
    await expect(host.page.locator('.host-names')).not.toContainText('נתן ישנוני');

    await host.page.getByRole('button', { name: /התחל משחק/ }).click();
    await expect(a.page.getByText(/שאלה 1 מתוך/)).toBeVisible({ timeout: 20_000 });
    // the sleepy phone wakes up during the question and answers
    await expect(sleepy.page.getByText(/שאלה 1 מתוך/)).toBeVisible();
    await answerFirst(sleepy);
    await answerFirst(a);
    await expect(host.page.locator('.reveal-card')).toBeVisible({ timeout: 20_000 });
    await expect(a.page.getByText(/שאלה 2 מתוך/)).toBeVisible({ timeout: 20_000 });
    expect((await db.list(`rooms/${code}/players`)).find(p => p.data.name === 'אלי כהן')!.data.answered).toBe(1);
    expect(db.failures, 'Firestore writes that failed').toEqual([]);
  });

  test('F03-E2 a wrong host code does not open a room', async ({ browser, db }) => {
    const p = await openPlayer(browser, db, { answers: ['1111'] });
    await p.page.getByRole('button', { name: /כניסת מנחה משחק/ }).click();
    await expect.poll(() => p.dialogs.length).toBe(2);
    expect(p.dialogs[1]).toContain('קוד שגוי');
    expect(await db.get('rooms/current')).toBeUndefined();
  });

  test('F03-E3 the same name joining twice is listed once', async ({ browser, db }) => {
    const host = await openHost(browser, db);
    await joinGroup(browser, db, 'אלי כהן');
    await joinGroup(browser, db, 'אלי  כהן');
    await expect.poll(async () => (await db.list(`rooms/${await roomCode(db)}/players`)).length).toBe(1);
    await expect(host.page.locator('.host-names .pchip')).toHaveCount(1);
  });

  test('F03-E4 pause keeps the remaining time', async ({ browser, db }) => {
    const host = await openHost(browser, db);
    const a = await joinGroup(browser, db, 'אלי כהן');
    await host.page.getByRole('button', { name: /התחל משחק/ }).click();
    await expect(host.page.locator('#h-pause')).toBeVisible({ timeout: 20_000 });
    await host.page.locator('#h-pause').click();
    await expect(a.page.getByText('רגע של עצירה')).toBeVisible();
    await host.page.waitForTimeout(12_000);
    await host.page.getByRole('button', { name: /המשיכו/ }).click();
    await expect(a.page.locator('#p-answers').getByRole('button').first()).toBeEnabled();
    expect(Number(await a.page.locator('#p-timer-num').innerText())).toBeGreaterThan(3);
  });

  test('F03-E5 a name with quotes cannot inject attributes into other players\' screens', async ({ browser, db }) => {
    const host = await openHost(browser, db);
    await joinGroup(browser, db, 'אבי" onclick="window.__pwned=1');
    const av = host.page.locator('.crowd-wall .av').first();
    await expect(av).toBeVisible();
    expect(await av.getAttribute('onclick')).toBeNull();
    await av.click();
    expect(await host.page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  });
});
