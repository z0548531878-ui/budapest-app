// Screenshots of every screen, organizer and participant, for a visual review: SHOTS=1 npx playwright test e2e/trip-shots.spec.ts
import { test, expect, openTrip } from './helpers';
import { seedBigTrip } from './trip-seed';

test.skip(!process.env.SHOTS, 'screenshots only: SHOTS=1');
test.setTimeout(300_000);
const OUT = process.env.SHOTS_OUT || '/tmp/shots';

for (const role of ['org', 'guest'] as const) {
  test(`shots: ${role}`, async ({ browser, db }) => {
    await seedBigTrip(db);
    // a last-minute change: Friday's lunch moved from 13:00 to 13:30
    await db.put(`trips/test-trip-key-0123456789abcdef/settings/prog`, { fix: { fri_2: { tm: '13:30', ti: 'ארוחת ״טועמיה״', sub: 'במסעדת חנה, בטרם נכנסת השבת', at: '2026-11-20T09:00:00Z', by: 'שלומי' } } });
    const { page } = await openTrip(browser, db);
    // SHOTS_AT=2026-11-20T12:40:00+01:00 shows the app as it looks during the trip
    if (process.env.SHOTS_AT) await page.clock.setFixedTime(new Date(process.env.SHOTS_AT));
    await page.evaluate(r => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', r === 'guest' ? 'guest:p2' : 'org'); }, role);
    await page.reload();
    await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
    const screens: [string, string][] = role === 'org'
      ? [['home', "go('home')"], ['tasks', "go('tasks')"], ['money', "go('money')"], ['money-people', "V.seg='participants';render(true)"], ['money-cash', "V.seg='cash';render(true)"], ['sched', "go('sched')"], ['more', "go('more')"],
         ...['people', 'passports', 'packing', 'rooms', 'flights', 'program', 'settings', 'messages', 'attendance', 'claude', 'notes', 'files', 'contacts'].map(s => [s, `go('more',{sub:'${s}'})`] as [string, string])]
      : ['gh', 'gx', 'gl', 'gp', 'gr', 'gt', 'gm', 'gq', 'gf', 'gk'].map(t => [t, `GTAB='${t}';render(true)`] as [string, string]);
    for (const [name, js] of screens) {
      await page.evaluate(js + ';scrollTo(0,0)');
      await page.waitForTimeout(1600);
      await page.screenshot({ path: `${OUT}/${process.env.SHOTS_AT ? 'trip-' : ''}${role}-${name}.png`, fullPage: true });
    }
  });
}
