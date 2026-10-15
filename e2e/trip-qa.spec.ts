// Full sweep of the trip app for a visual/smoothness review: QA=1 npx playwright test e2e/trip-qa.spec.ts
// Every screen, organizer and participant, at three widths: overflow past the screen edge, errors, layout jumps when the
// screen enters / when data changes / on reload, and long frames while scrolling down and up (4x slower CPU).
import { test, expect, openTrip, TRIP as T } from './helpers';
import { seedBigTrip as seed } from './trip-seed';
import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test.skip(!process.env.QA, 'review only: QA=1');
test.setTimeout(900_000);

const ORG: [string, string][] = [['home', "go('home')"], ['tasks', "go('tasks')"], ['money', "go('money')"], ['money/participants', "V.seg='participants';render(true)"], ['money/expenses', "V.seg='expenses';render(true)"], ['money/cash', "V.seg='cash';render(true)"], ['sched', "go('sched')"], ['chat', "go('chat')"], ['more', "go('more')"],
  ...['people', 'passports', 'packing', 'rooms', 'flights', 'program', 'settings', 'attendance', 'announce', 'photos', 'rides', 'files', 'contacts', 'messages', 'notes', 'claude', 'guide'].map(s => [s, `go('more',{sub:'${s}'})`] as [string, string])];
const GUEST: [string, string][] = ['gh', 'gl', 'gr', 'gt', 'gq', 'gy', 'gm', 'gx', 'gp', 'gf', 'gk', 'gz', 'gd', 'gi', 'gc', 'gs', 'gb', 'gw'].map(t => [t, `GTAB='${t}';render(true);scrollTo(0,0)`]);

async function probe(page: Page, ms: number, act: string, scroll = false) {
  return page.evaluate(async ([ms, act, scroll]) => {
    const frames: number[] = []; let shift = 0; const shifts: string[] = [];
    const po = new PerformanceObserver(l => l.getEntries().forEach((e: any) => { if (e.hadRecentInput) return; shift += e.value;
      if (e.value > 0.01) shifts.push((e.sources || []).map((s: any) => s.node ? (s.node.className || s.node.nodeName) : '?').slice(0, 2).join(',') + ' ' + e.value.toFixed(3)); }));
    po.observe({ type: 'layout-shift', buffered: false });
    const t0 = performance.now(); let last = t0;
    const fr = (t: number) => { frames.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(fr); };
    requestAnimationFrame(fr);
    (0, eval)(act as string);
    if (scroll) { const H = document.documentElement.scrollHeight; for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 60)); window.scrollTo(0, (H * (i + 1)) / 12); } for (let i = 12; i >= 0; i--) { await new Promise(r => setTimeout(r, 60)); window.scrollTo(0, (H * i) / 12); } }
    await new Promise(r => setTimeout(r, ms as number + 50)); po.disconnect();
    // anything visible that sticks out past the screen edge
    const W = innerWidth, out: string[] = [];
    document.querySelectorAll('#view *, header.top *, #nav *').forEach(el => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      let p: Element | null = el.parentElement, clipped = false; while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= W + 1 && pr.left >= -1) { clipped = true; break } } p = p.parentElement; }
      if (!clipped && (r.right > W + 2 || r.left < -2)) out.push((el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.nodeName) + ` ${Math.round(r.left)}..${Math.round(r.right)}`); });
    return { long: frames.filter(f => f > 50).length, worst: Math.round(Math.max(0, ...frames)), shift: +shift.toFixed(3), shifts: shifts.slice(0, 3),
      hScroll: document.documentElement.scrollWidth > W + 1, out: [...new Set(out)].slice(0, 5) };
  }, [ms, act, scroll] as const);
}

for (const role of ['org', 'guest'] as const) for (const W of [360, 412, 768]) {
  test(`qa: ${role} @${W}`, async ({ browser, db }) => {
    await seed(db);
    const { page } = await openTrip(browser, db);
    const errs: string[] = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
    await page.setViewportSize({ width: W, height: W > 600 ? 1024 : 800 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(r => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', r === 'guest' ? 'guest:p5' : 'org'); }, role);
    await page.reload();
    await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
    if (role === 'org') await page.evaluate("setRole('org')");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(1200);
    const rows: any[] = [];
    for (const [name, js] of role === 'org' ? ORG : GUEST) {
      const enter = await probe(page, 1200, js);
      const scroll = await probe(page, 300, '0', true);
      const upd = probe(page, 1200, '0');
      await page.waitForTimeout(30);
      await db.put(`${T}/tasks/t1`, { title: 'משימה ששונתה ' + Date.now(), owner: 'שלומי', status: 'בתהליך', priority: 'רגילה', category: 'אחר', due: '', notes: '', order: 1 });
      const update = await upd;
      rows.push({ name, enter, scroll: { long: scroll.long, worst: scroll.worst, shift: scroll.shift }, update: { long: update.long, shift: update.shift, shifts: update.shifts } });
    }
    // reload: what jumps while the app comes up
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.addInitScript(() => { (window as any).__ls = 0; (window as any).__lsn = []; new PerformanceObserver(l => l.getEntries().forEach((e: any) => { if (!e.hadRecentInput) { (window as any).__ls += e.value; if (e.value > 0.01) (window as any).__lsn.push((e.sources || []).map((s: any) => s.node ? (s.node.className || s.node.nodeName) : '?').slice(0, 2).join(',') + ' ' + e.value.toFixed(3)); } })).observe({ type: 'layout-shift', buffered: true }); });
    await page.reload(); await page.waitForTimeout(4000);
    const reload = await page.evaluate(() => ({ cls: +(window as any).__ls.toFixed(3), shifts: (window as any).__lsn.slice(0, 6) }));
    writeFileSync(`${process.env.QA_OUT || '/tmp'}/qa-${role}-${W}.json`, JSON.stringify({ rows, reload, errs: [...new Set(errs)].slice(0, 20) }, null, 1));
  });
}
