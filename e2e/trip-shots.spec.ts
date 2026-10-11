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
    // shared rides and a task for everyone
    const T = `trips/test-trip-key-0123456789abcdef`;
    await db.put(`${T}/settings/ride_1`, { kind: 'ride', dir: 'out', type: 'car', by: 'p5', byName: 'משה כהן', from: 'בני ברק', time: '05:15', seats: 3, note: 'יש מקום למזוודה גדולה', join: ['p7'], ts: 1 });
    await db.put(`${T}/settings/ride_2`, { kind: 'ride', dir: 'out', type: 'seek', by: 'p9', byName: 'יוסי לוי', from: 'ירושלים', time: '04:45', seats: 2, note: '', join: [], ts: 2 });
    await db.put(`${T}/settings/ride_3`, { kind: 'ride', dir: 'out', type: 'taxi', by: 'p2', byName: 'גלעד מור', from: 'פתח תקווה', time: '05:30', seats: 2, note: 'מזמינים גט', join: [], ts: 3 });
    await db.put(`${T}/settings/gtask_1`, { kind: 'gtask', title: 'להביא תהילים לציון', text: 'כל אחד מביא ספר תהילים קטן', ts: 5, done: {} });
    const { page } = await openTrip(browser, db);
    // SHOTS_AT=2026-11-20T12:40:00+01:00 shows the app as it looks during the trip
    if (process.env.SHOTS_AT) await page.clock.setFixedTime(new Date(process.env.SHOTS_AT));
    await page.evaluate(r => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', r === 'guest' ? 'guest:p2' : 'org'); }, role);
    await page.reload();
    await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
    // a few photos in the gallery (gradients drawn in the page)
    await page.evaluate(async () => {
      const hues = [[30, 60], [200, 260], [340, 20], [120, 180], [45, 15], [270, 310], [10, 40]];
      for (let i = 0; i < hues.length; i++) {
        const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d')!;
        const g = x.createLinearGradient(0, 0, 300, 300); g.addColorStop(0, `hsl(${hues[i][0]} 60% 45%)`); g.addColorStop(1, `hsl(${hues[i][1]} 70% 20%)`);
        x.fillStyle = g; x.fillRect(0, 0, 300, 300); x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.arc(90 + i * 20, 120, 50, 0, 7); x.fill();
        await (0, eval)('db').doc('photos/ph' + i).set({ th: c.toDataURL('image/jpeg', .7), w: 300, h: 300, by: i % 3 ? 'p5' : 'p2', byName: i % 3 ? 'משה כהן' : 'גלעד מור', ts: Date.now() - i * 6e5 });
      }
    });
    const screens: [string, string][] = role === 'org'
      ? [['home', "go('home')"], ['tasks', "go('tasks')"], ['money', "go('money')"], ['money-people', "V.seg='participants';render(true)"], ['money-cash', "V.seg='cash';render(true)"], ['sched', "go('sched')"], ['more', "go('more')"],
         ...['announce', 'photos', 'rides', 'people', 'passports', 'packing', 'rooms', 'flights', 'program', 'settings', 'messages', 'attendance', 'claude', 'notes', 'files', 'contacts'].map(s => [s, `go('more',{sub:'${s}'})`] as [string, string])]
      : ['gh', 'gx', 'gl', 'gp', 'gr', 'gt', 'gm', 'gq', 'gf', 'gk', 'gz', 'gd', 'gi'].map(t => [t, `GTAB='${t}';render(true)`] as [string, string]);
    for (const [name, js] of screens) {
      await page.evaluate(js + ';scrollTo(0,0)');
      await page.waitForTimeout(1600);
      await page.screenshot({ path: `${OUT}/${process.env.SHOTS_AT ? 'trip-' : ''}${role}-${name}.png`, fullPage: true });
      // the participant's home tiles appear as they scroll into view
      if (role === 'guest' && name === 'gh') {
        await page.locator('.gcb').scrollIntoViewIfNeeded(); await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/guest-gh-tiles.png` });
      }
    }
  });
}
