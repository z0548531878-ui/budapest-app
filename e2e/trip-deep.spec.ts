import { test, expect, openTrip } from './helpers';
import { seedBigTrip } from './trip-seed';
import { writeFileSync } from 'node:fs';
// Deep sweep (review only, QA=1): every screen and sub-screen for organizers and participants, every kind of button on it,
// with a 4x slower CPU: script errors, screens that keep redrawing while idle (flicker), layout jumps and long frames.
test.skip(!process.env.QA, 'review only: QA=1');
test.setTimeout(900_000);
const OUT = process.env.QA_OUT || '.';
async function idle(page: any, ms = 2200) {
  return page.evaluate(async (ms: number) => {
    let mut = 0; const who: Record<string, number> = {}; let shift = 0; const sh: string[] = []; const fr: number[] = []; let last = performance.now(); const t0 = last;
    const mo = new MutationObserver(l => l.forEach(m => { const t = m.target as Element; const n = (t.nodeType === 1 ? t : t.parentElement) as Element; if (!n || n.closest('.bpt,.bp-cd,#gcdT,.tapfx,.rip,.syncago,.sky,.skyfx,[data-rdy],.nc-bar')) return; mut++; const k = (n.id ? '#' + n.id : '') + (typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : n.nodeName); who[k] = (who[k] || 0) + 1; }));
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'hidden'] });
    const po = new PerformanceObserver(l => l.getEntries().forEach((e: any) => { if (e.hadRecentInput) return; shift += e.value; if (e.value > .005) sh.push((e.sources || []).map((s: any) => s.node ? (s.node.id || s.node.className || s.node.nodeName) : '?').join('|').slice(0, 60) + ' ' + e.value.toFixed(3)); }));
    po.observe({ type: 'layout-shift' });
    const f = (t: number) => { fr.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); }; requestAnimationFrame(f);
    await new Promise(r => setTimeout(r, ms)); mo.disconnect(); po.disconnect();
    return { mut, who: Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 4), shift: +shift.toFixed(3), sh: sh.slice(0, 3), long: fr.filter(x => x > 50).length, worst: Math.round(Math.max(0, ...fr)) };
  }, ms);
}
async function trans(page: any, act: string) {
  return page.evaluate(async (act: string) => { const fr: number[] = []; let last = performance.now(); const t0 = last; let go = true;
    const f = (t: number) => { fr.push(t - last); last = t; if (go) requestAnimationFrame(f); }; requestAnimationFrame(f);
    try { (0, eval)(act); } catch (e: any) { go = false; return { err: String(e.message || e) }; }
    await new Promise(r => setTimeout(r, 1300)); go = false; return { long: fr.filter(x => x > 50).length, worst: Math.round(Math.max(0, ...fr)) }; }, act);
}
for (const role of ['org', 'guest:p2'] as const) test('deep ' + role, async ({ browser, db }) => {
  await seedBigTrip(db);
  const { page: p0 } = await openTrip(browser, db); const url = p0.url(); const ls = await p0.evaluate(() => JSON.stringify(localStorage)); await p0.context().close();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference', locale: 'he-IL' });
  const page = await ctx.newPage(); const errs: string[] = [];
  page.on('pageerror', (e: any) => errs.push('PE ' + e.message + ' @@ ' + String(e.stack).slice(0, 400))); page.on('console', (m: any) => { if (m.type() === 'error' && !/open-meteo|Failed to load resource|ERR_|net::/.test(m.text())) errs.push('CE ' + m.text().slice(0, 160)); });
  await page.goto(url); await page.evaluate((a: any) => { const o = JSON.parse(a[0]); for (const k in o) localStorage.setItem(k, o[k]); localStorage.setItem('nogate', '1'); localStorage.setItem('role', a[1]); sessionStorage.setItem('skipInst', '1'); sessionStorage.setItem('splash', '1'); }, [ls, role]);
  await page.reload(); await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))'), { timeout: 30000 }).toBe(true);
  if (role === 'org') await page.evaluate("setRole('org')");
  await page.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const screens: string[][] = role === 'org'
    ? [['home', "go('home')"], ['tasks', "go('tasks')"], ['money', "go('money')"], ...['participants', 'expenses', 'donations', 'cash', 'sum'].map(s => ['money/' + s, `go('money');V.seg='${s}';render(true)`]), ['sched', "go('sched')"], ['chat', "go('chat')"], ['more', "go('more')"],
       ...(await page.evaluate('Object.keys(SUB)') as string[]).map(s => ['more/' + s, `go('more',{sub:'${s}'})`])]
    : (['gh', 'gl', 'gr', 'gt', 'gq', 'gy', 'gm', 'gx', 'gp', 'gf', 'gk', 'gz', 'gd', 'gi', 'gc', 'gs', 'gb', 'gw', 'gv', 'ge', 'gn', 'gkt', 'grm', 'gcn']).map(t => [t, `GTAB='${t}';render(true);scrollTo(0,0)`]);
  const rows: any[] = [];
  for (const [name, act] of screens) {
    const e0 = errs.length; const t = await trans(page, act); await page.waitForTimeout(300);
    const i = await idle(page);
    // open up to two records in this screen, then close them
    const opened: any[] = [];
    for (const sel of ['[data-edit]', '[data-person] .main', '[data-flight]', '[data-pay]', '[data-ppass]', '[data-msg]', '[data-don]', '[data-vexp]', '[data-pid]', '[data-f]', '.main[role=button]', '[data-gnav]:not([data-gnav=gh])', '[data-xt]']) {
      const n = await page.locator('#view ' + sel).count(); if (!n) continue;
      for (const k of [0, Math.min(n - 1, 3)].filter((v, j, a) => a.indexOf(v) === j)) {
        const el = page.locator('#view ' + sel).nth(k); if (!(await el.isVisible().catch(() => false))) continue;
        const e1 = errs.length; await el.scrollIntoViewIfNeeded().catch(() => 0); await el.click({ timeout: 3000 }).catch((x: any) => errs.push('CLICK ' + sel + ' ' + String(x.message).slice(0, 80)));
        await page.waitForTimeout(500); const si = await idle(page, 1200);
        const hasSheet = await page.locator('#scrim').count();
        opened.push({ sel, k, sheet: hasSheet, mut: si.mut, who: si.who.slice(0, 2), long: si.long, errs: errs.slice(e1) });
        if (hasSheet) { await page.evaluate("closeSheet()"); await page.waitForTimeout(450); }
        else { await page.evaluate(a => (0, eval)(a), act); await page.waitForTimeout(400); }
        if (sel === '[data-xt]') break;
      }
      if (opened.length >= 8) break;
    }
    // every kind of button on this screen once (each first data-attribute kind), skipping ones that delete, send or leave
    const kinds: string[] = await page.evaluate(() => { const seen = new Set<string>(); const out: string[] = [];
      document.querySelectorAll('#view button, #view [role=button], #view .chip, #view label.toggle').forEach((el, i) => { const r = (el as HTMLElement).getBoundingClientRect(); if (!r.width || (el as any).disabled) return;
        const h = el.outerHTML.slice(0, 300); if (/del|remove|logout|switch|reset|wipe|trash|hide|send|signout|data-nav=|data-go=|data-gnav=|data-board|data-roll|reject|accept|approve|claim|undo|done|tel:|wa\.me|data-copy|data-share|upload|file|data-dl|data-print|xlsx|export|import|data-save|data-pv|data-setme|setRole|prevx|prevsw|data-swipe/i.test(h)) return;
        const k = ([...el.attributes].map(a => a.name).find(n => n.startsWith('data-')) || el.className.split(' ')[0] || 'btn'); if (seen.has(k)) return; seen.add(k); (el as HTMLElement).setAttribute('data-qa', String(i)); out.push(String(i)); }); return out.slice(0, 14); });
    for (const q of kinds) { const e1 = errs.length; const el = page.locator(`#view [data-qa="${q}"]`); if (!(await el.count())) continue;
      await el.first().click({ timeout: 2500, force: true }).catch(() => 0); await page.waitForTimeout(450);
      const what = await page.evaluate(q => document.querySelector(`[data-qa="${q}"]`)?.outerHTML.slice(0, 90) || 'gone', q);
      if (errs.length > e1) opened.push({ sel: 'btn ' + what, k: 0, sheet: 0, mut: 0, who: [], long: 0, errs: errs.slice(e1) });
      if (await page.locator('#scrim').count()) { await page.evaluate('closeSheet()'); await page.waitForTimeout(400); }
      await page.evaluate(() => { document.querySelectorAll('.grow-o').forEach(x => x.remove()); });
      if (!(await page.locator(`#view [data-qa]`).count())) { await page.evaluate(a => (0, eval)(a), act); await page.waitForTimeout(350); await page.evaluate(ks => { const all = [...document.querySelectorAll('#view button, #view [role=button], #view .chip, #view label.toggle')]; }, kinds); break; } }
    rows.push({ name, t, i, opened, nk: kinds.length, errs: errs.slice(e0) });
  }
  // sheets from the header and the bottom bar
  const extra: string[][] = role === 'org' ? [['settings', 'openSettings()'], ['add', "document.querySelector('#nav [data-nav=add],#nav .add,#nav button.plus')?.click()"], ['pickMe', 'pickMe()'], ['search', 'gSearch()'], ['field', 'fieldSheet()'], ['pickup', 'pickupSheet()']]
    : [['settings', 'openSettings()'], ['sos', 'sosSheet()'], ['thx', 'thxSheet()'], ['req', "GTAB='gq';render(true)"]];
  for (const [name, act] of extra) { const e0 = errs.length; await page.evaluate("go&&GUEST&&!GUEST()?go('home'):(GTAB='gh',render(true))").catch(() => 0); await page.waitForTimeout(400); const t = await trans(page, act); const i = await idle(page, 1500); rows.push({ name: 'sheet:' + name, t, i, errs: errs.slice(e0) }); await page.evaluate("closeSheet&&closeSheet()").catch(() => 0); await page.waitForTimeout(400); }
  writeFileSync(`${OUT}/deep-${role.replace(':', '')}.json`, JSON.stringify({ rows, errs }, null, 1));
  console.log('DONE', role, rows.length, errs.length);
  await ctx.close();
});
