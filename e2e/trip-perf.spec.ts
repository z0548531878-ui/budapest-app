// Smoothness of the trip app on a mid-range phone: every screen, organizer and participant.
// Not part of the normal run (it measures, it doesn't pass/fail on taste): PERF=1 npx playwright test e2e/trip-perf.spec.ts
// For each screen: frames that took too long while the screen enters, layout shifts (things jumping), endless animations
// that repaint every frame, and what a background data change does (animations that restart = the "flash"/"shake").
import { test, expect, openTrip, TRIP as T, type Db } from './helpers';
import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test.skip(!process.env.PERF && !process.env.PROBE, 'measurement only: PERF=1');
test.setTimeout(600_000);

const FIRST = ['אבי', 'בני', 'גלעד', 'דוד', 'הדס', 'ורד', 'זיו', 'חנה', 'טל', 'יעל', 'כרמל', 'לאה', 'מיכל', 'נועה', 'עדי'];
const LAST = ['כהן', 'לוי', 'מור', 'פז', 'רוזן', 'שגיא', 'ברק', 'גולד'];
async function seed(db: Db) {
  const put = (p: string, d: object) => db.put(`${T}/${p}`, d);
  await put('settings/trip', { team: ['שלומי', 'איציק', 'יעל'] });
  for (let i = 0; i < 60; i++) {
    const st = ['שולם', 'שולם', 'לא שולם', 'שולם חלקית'][i % 4];
    await put(`participants/p${i}`, { name: `${FIRST[i % 15]} ${LAST[i % 8]}${i > 14 ? ' ' + i : ''}`, amount: 1750, phone: '05012345' + String(i).padStart(2, '0'),
      status: st, paidAmt: st === 'שולם חלקית' ? 500 : 0, holder: i % 2 ? 'שלומי' : 'איציק', passport: i % 3 !== 0, outbound: 'קבוצתי', returnGroup: ['מוצ״ש', 'ראשון צהריים', 'ראשון ערב'][i % 3], order: i });
  }
  for (let i = 0; i < 40; i++) await put(`tasks/t${i}`, { title: `משימה מספר ${i}`, owner: ['שלומי', 'איציק', 'יעל'][i % 3], status: ['לביצוע', 'בתהליך', 'ממתין', 'בוצע'][i % 4], priority: i % 5 ? 'רגילה' : 'גבוהה', category: 'אחר', due: '', notes: '', order: i });
  for (let i = 0; i < 25; i++) await put(`expenses/e${i}`, { name: `הוצאה ${i}`, category: ['לינה', 'אוכל', 'הסעות', 'אחר'][i % 4], estimate: 1000 + i * 100, paid: i % 2 ? 500 : 0, status: i % 2 ? 'מקדמה' : 'לא שולם', paidBy: 'איציק', order: i });
  for (let i = 0; i < 30; i++) await put(`rooms/r${i}`, { occupants: `${FIRST[i % 15]} ${LAST[i % 8]}`, roomNumber: String(400 + i), floor: '4', type: 'חדר לזוג', kitReady: i % 2 === 0, order: i });
  for (let i = 0; i < 40; i++) await put(`packing/k${i}`, { item: `פריט ${i}`, qty: 10, list: 'שבת', where: i % 2 ? 'בארץ' : 'בבודפשט', done: i % 3 === 0, order: i });
  for (let i = 0; i < 12; i++) await put(`schedule/s${i}`, { day: ['יום חמישי', 'יום שישי', 'שבת'][i % 3], time: `${8 + i}:00`, title: `אירוע ${i}`, place: 'מלון', order: i });
  await put('flights/f1', { label: 'קבוצתי', dir: 'הלוך', group: 'קבוצתי', flightNo: 'LY 2369', date: '2026-11-19', dep: '08:40', arr: '11:15' });
  for (let i = 0; i < 30; i++) await put(`activity/a${i}`, { by: 'יעל', at: `2026-10-0${1 + (i % 8)}T10:${String(i).padStart(2, '0')}:00Z`, act: 'edit', col: 'tasks', rid: `t${i}`, title: `משימה מספר ${i}` });
}

/** Measures the next `ms` of the page: long frames, layout shift, and which animations run. */
async function measure(page: Page, ms: number, act: string) {
  return page.evaluate(async ([ms, act]) => {
    const w = window as any;
    const frames: number[] = []; let shift = 0; const shifts: string[] = [];
    const po = new PerformanceObserver(l => l.getEntries().forEach((e: any) => {
      if (e.hadRecentInput) return; shift += e.value;
      if (e.value > 0.01) shifts.push((e.sources || []).map((s: any) => s.node ? (s.node.className || s.node.nodeName) : '?').slice(0, 3).join(',') + ' ' + e.value.toFixed(3));
    }));
    po.observe({ type: 'layout-shift', buffered: false });
    const t0 = performance.now(); let last = t0;
    const fr = (t: number) => { frames.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(fr); };
    requestAnimationFrame(fr);
    // eslint-disable-next-line no-eval
    (0, eval)(act);
    await new Promise(r => setTimeout(r, ms + 50));
    po.disconnect();
    const view = document.getElementById('view')!;
    const anims = document.getAnimations().filter(a => a.playState === 'running') as any[];
    const paintProps = /boxShadow|filter|backgroundPosition|width|height|top|left|textShadow|borderColor|background(?!Position)/;
    const props = (a: any) => { try { return Object.keys(Object.assign({}, ...a.effect.getKeyframes())).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)); } catch { return []; } };
    const endless = anims.filter(a => a.effect?.getTiming().iterations === Infinity);
    const repaint = endless.filter(a => props(a).some((p: string) => paintProps.test(p)));
    const name = (a: any) => a.animationName || a.transitionProperty || '?';
    return {
      longFrames: frames.filter(f => f > 34).length, worstFrame: Math.round(Math.max(0, ...frames)), frames: frames.length,
      shift: +shift.toFixed(3), shifts: shifts.slice(0, 4),
      endless: endless.length, repaintEndless: [...new Set(repaint.map(name))],
      inView: anims.filter(a => view.contains(a.effect?.target)).length,
      nodes: view.querySelectorAll('*').length,
    };
  }, [ms, act] as const);
}

for (const role of ['org', 'guest'] as const) {
  test(`perf: ${role}`, async ({ browser, db }) => {
    await seed(db);
    const { page } = await openTrip(browser, db);
    await page.evaluate(r => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', r === 'guest' ? 'guest:p5' : 'org'); }, role);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(1500);
    const screens: [string, string][] = role === 'org'
      ? [['home', "go('home')"], ['tasks', "go('tasks')"], ['money', "go('money')"], ['money/participants', "V.seg='participants';render(true)"], ['money/cash', "V.seg='cash';render(true)"], ['sched', "go('sched')"], ['more', "go('more')"],
         ...['people', 'passports', 'packing', 'rooms', 'flights', 'program', 'settings', 'attendance'].map(s => [s, `go('more',{sub:'${s}'})`] as [string, string])]
      : ['gh', 'gx', 'gl', 'gp', 'gr', 'gt', 'gm', 'gq', 'gf'].map(t => [t, `GTAB='${t}';render(true);scrollTo(0,0)`] as [string, string]);
    const out: any[] = [];
    for (const [name, js] of screens) {
      const enter = await measure(page, 1800, js);
      const idle = await measure(page, 1500, '0');
      // another phone changes something: what does this screen do?
      const upd = measure(page, 1500, '0');
      await page.waitForTimeout(30);
      await db.put(`${T}/tasks/t1`, { title: 'משימה ששונתה ' + Date.now(), owner: 'שלומי', status: 'בתהליך', priority: 'רגילה', category: 'אחר', due: '', notes: '', order: 1 });
      await db.put(`${T}/participants/p7`, { name: 'זיו מור', amount: 1750, phone: '0501234507', status: Date.now() % 2 ? 'שולם' : 'לא שולם', holder: 'שלומי', passport: true, order: 7 });
      const update = await upd;
      out.push({ screen: name, enter, idle: { longFrames: idle.longFrames, worstFrame: idle.worstFrame, endless: idle.endless, repaintEndless: idle.repaintEndless, nodes: idle.nodes }, update: { longFrames: update.longFrames, worstFrame: update.worstFrame, shift: update.shift, shifts: update.shifts, restarted: update.inView } });
    }
    writeFileSync(test.info().outputPath(`perf-${role}.json`), JSON.stringify(out, null, 1));
    writeFileSync(`${process.env.PERF_OUT || '/tmp'}/perf-${role}.json`, JSON.stringify(out, null, 1));
  });
}

test('probe sizes', async ({ browser, db }) => {
  test.skip(!process.env.PROBE);
  await seed(db);
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:p5'); });
  await page.reload(); await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  const h = async (sel: string) => page.evaluate(s => [...document.querySelectorAll(s)].slice(0, 6).map(e => Math.round(e.getBoundingClientRect().height)), sel);
  await page.evaluate("GTAB='gp';render(true)"); await page.waitForTimeout(2500); console.log('PROBE pc', await h('.pc'), await h('.pl'), await h('.plh'));
  await page.evaluate(() => { localStorage.setItem('role', 'org'); }); await page.reload(); await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  await page.evaluate("go('more',{sub:'people'})"); await page.waitForTimeout(2500); console.log('PROBE prow', await h('.prow'));
  const shifts = await page.evaluate(async () => { const out: string[] = []; const po = new PerformanceObserver(l => l.getEntries().forEach((e: any) => (e.sources || []).forEach((x: any) => out.push((x.node?.className || x.node?.nodeName) + ' ' + JSON.stringify([x.previousRect.y, x.previousRect.height, x.currentRect.y, x.currentRect.height]))))); po.observe({ type: 'layout-shift' });
    (0, eval)("go('money')"); await new Promise(r => setTimeout(r, 300)); (0, eval)("V.seg='cash';render(true)"); await new Promise(r => setTimeout(r, 1200)); (0, eval)("go('tasks')"); await new Promise(r => setTimeout(r, 1200)); po.disconnect(); return out; });
  console.log('PROBE shifts', shifts);
});

test('probe nav', async ({ browser, db }) => {
  test.skip(!process.env.PROBE);
  await seed(db);
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'org'); });
  await page.reload(); await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  for (const t of ['home', 'tasks', 'money', 'sched', 'more']) {
    await page.evaluate(`go('${t}')`); await page.waitForTimeout(700);
    console.log('PROBE nav', t, await page.evaluate(t => { const i = document.querySelector('.ind')!.getBoundingClientRect(), b = document.querySelector(`[data-nav="${t}"]`)!.getBoundingClientRect(); return Math.round((i.left + i.width / 2) - (b.left + b.width / 2)); }, t));
  }
  await page.screenshot({ path: test.info().outputPath('nav.png') });
});
