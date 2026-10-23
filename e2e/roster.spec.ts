// The record tables show only people on the trip list. Outsiders can play and see themselves, but nobody else sees them.
import { test, expect, openPlayer, openTrip, enterName, TRIP as T } from './helpers';

const SOLO = 'solo_players_s7';
const PEOPLE = ['אבי כהן', 'בני לוי', 'יוסף דוד מזרחי', 'הרב משה פרידמן', 'שרה כהן'];

test.describe('F11 trip-only record tables', () => {
  test('F11-H1 the trip app publishes the roster; only trip people appear to others, an outsider sees only himself added', async ({ browser, db }) => {
    for (const [i, n] of PEOPLE.entries()) await db.put(`${T}/participants/p${i}`, { name: n, order: i });
    const trip = await openTrip(browser, db);
    await expect.poll(async () => (await db.get('rooms/trip_roster'))?.h?.length ?? 0, { timeout: 15000 }).toBeGreaterThan(10);
    expect(JSON.stringify(await db.get('rooms/trip_roster'))).not.toContain('כהן'); // fingerprints only, no names
    await trip.page.close();

    await db.put(`${SOLO}/אבי כהן`, { name: 'אבי כהן', best: 300, bestQ: 30 });
    await db.put(`${SOLO}/מזרחי יוסף`, { name: 'מזרחי יוסף', best: 250, bestQ: 30 }); // order swapped, middle name dropped
    await db.put(`${SOLO}/משה פרידמן`, { name: 'משה פרידמן', best: 200, bestQ: 30 });  // without "הרב"
    await db.put(`${SOLO}/זר מבחוץ`, { name: 'זר מבחוץ', best: 400, bestQ: 30 });

    // a trip member does not see the outsider
    const a = await openPlayer(browser, db);
    await a.page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(a.page, 'בני לוי');
    const board = a.page.locator('#solo-body .board-row');
    await expect(board.filter({ hasText: 'אבי כהן' })).toHaveCount(1);
    await expect(board.filter({ hasText: 'מזרחי יוסף' })).toHaveCount(1);
    await expect(board.filter({ hasText: 'משה פרידמן' })).toHaveCount(1);
    await expect(board.filter({ hasText: 'זר מבחוץ' })).toHaveCount(0);

    // the outsider sees the trip people and himself, in his place
    const b = await openPlayer(browser, db);
    await b.page.getByRole('button', { name: /משחק עצמאי/ }).click();
    await enterName(b.page, 'זר מבחוץ');
    const rows = b.page.locator('#solo-body .board-row');
    await expect(rows.first()).toContainText('זר מבחוץ');
    await expect(rows.filter({ hasText: 'אבי כהן' })).toHaveCount(1);
  });
});
