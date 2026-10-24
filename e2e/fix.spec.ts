// An organizer's record correction: shown as asked; a later real record counts again.
import { test, expect, openPlayer, enterName } from './helpers';
const SOLO = 'solo_players_s7';

test('F15-H1 the corrected record shows, and a new real record replaces it', async ({ browser, db }) => {
  await db.put(`${SOLO}/משה וינר`, { name: 'משה וינר', best: 880, bestCorrect: 30, bestQ: 30, bestMs: 40000, bestAt: Date.parse('2026-10-24T20:00:00Z'), games: 5 });
  await db.put(`${SOLO}/אחר`, { name: 'אחר', best: 800, bestQ: 30 });
  const { page } = await openPlayer(browser, db);
  await page.getByRole('button', { name: /משחק עצמאי/ }).click();
  await enterName(page, 'בודק שיאים');
  const rows = page.locator('#solo-body .board-row');
  await expect(rows.nth(0)).toContainText('אחר');
  await expect(rows.nth(1)).toContainText('משה וינר');
  await expect(rows.nth(1)).toContainText('724');
  await expect(rows.nth(1)).toContainText('26');
  // a real new record after the correction counts as usual
  await db.put(`${SOLO}/משה וינר`, { name: 'משה וינר', best: 890, bestCorrect: 30, bestQ: 30, bestMs: 39000, bestAt: Date.parse('2026-11-01T10:00:00Z'), games: 6 });
  await page.reload();
  await page.getByRole('button', { name: /משחק עצמאי/ }).click();
  await expect(page.locator('#solo-body .board-row').nth(0)).toContainText('890');
});
