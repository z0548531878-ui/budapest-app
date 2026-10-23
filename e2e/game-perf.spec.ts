// Speed and stalls of the game on slow phones (measurement: PERF=1 npx playwright test e2e/game-perf.spec.ts)
// Profiles: a fast desktop, a slow Android (CPU x6, slow 3G, 400ms to the database), an iPhone (Safari UA, x4 CPU, fast 3G).
import { test, expect } from './helpers';
import { devices, type Browser } from '@playwright/test';
import { FakeFirestore } from './fake-firestore';
import { writeFileSync } from 'node:fs';

test.skip(!process.env.PERF, 'measurement only: PERF=1');
test.setTimeout(900_000);

const PROFILES = [
  { name: 'desktop', ctx: {}, cpu: 1, net: null, dbMs: 30 },
  { name: 'slow-android', ctx: { ...devices['Galaxy S8'] }, cpu: 6, net: { latency: 400, down: 50_000, up: 25_000 }, dbMs: 400 },
  { name: 'iphone', ctx: { ...devices['iPhone 13'], defaultBrowserType: undefined }, cpu: 4, net: { latency: 150, down: 200_000, up: 90_000 }, dbMs: 200 },
];

async function run(browser: Browser, P: typeof PROFILES[number]) {
  const db = new FakeFirestore();
  for (let i = 0; i < 120; i++) db.put(`solo_players_s7/p${i}`, { name: 'שחקן ' + i, best: 100 + i * 3, bestQ: 30 });
  const { defaultBrowserType, ...ctxOpts } = P.ctx as any;
  const context = await browser.newContext(ctxOpts);
  await db.attach(context);
  await context.addInitScript(ms => {
    const wrap = () => { const f = (window as any).__fsCall; if (!f || f.__slow) return; const g = (...a: any[]) => new Promise(r => setTimeout(r, ms)).then(() => f(...a)); (g as any).__slow = 1; (window as any).__fsCall = g; };
    wrap(); document.addEventListener('DOMContentLoaded', wrap);
    (window as any).__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => (window as any).__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch {}
  }, P.dbMs);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu });
  if (P.net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: P.net.latency, downloadThroughput: P.net.down, uploadThroughput: P.net.up }); }
  const R: any = { profile: P.name };
  let t = Date.now();
  await page.goto(process.env.PAGE || '/index.html', { waitUntil: 'load', timeout: 300_000 });
  R.loadMs = Date.now() - t;
  await expect(page.getByRole('button', { name: /משחק עצמאי/ })).toBeVisible({ timeout: 120_000 });
  R.landingMs = Date.now() - t;
  await page.waitForTimeout(4000);
  R.startupLongTasks = await page.evaluate(() => { const a = (window as any).__lt as number[]; return { n: a.length, total: a.reduce((s, x) => s + x, 0), worst: Math.max(0, ...a) }; });
  await page.evaluate(() => { (window as any).__lt = []; });
  // register
  t = Date.now();
  await page.getByRole('button', { name: /משחק עצמאי/ }).click();
  const inp = page.locator('#sr-name'); await inp.fill('בודק מהירות'); await page.locator('#sr-go').click();
  await expect(page.locator('#solo-body .board-row').first()).toBeVisible({ timeout: 60_000 });
  R.registerToBoardMs = Date.now() - t;
  // start a round: how long until something happens, and until question 1
  t = Date.now();
  await page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
  await page.waitForFunction(() => document.querySelector('.cd-num, .countdown, #cd') || /שאלה 1 מתוך/.test(document.body.innerText), null, { timeout: 60_000 });
  R.tapToResponseMs = Date.now() - t;
  await expect(page.getByText('שאלה 1 מתוך 30')).toBeVisible({ timeout: 60_000 });
  R.tapToQ1Ms = Date.now() - t;
  // answer 12 questions: answer → next question
  const gaps: number[] = []; const frames: number[] = [];
  await page.evaluate(() => { const w = window as any; w.__fr = []; let last = performance.now(); const f = (x: number) => { w.__fr.push(x - last); last = x; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  for (let i = 1; i <= 12; i++) {
    await expect(page.getByText(`שאלה ${i} מתוך 30`)).toBeVisible({ timeout: 60_000 });
    const btn = page.locator('#s-answers .answer-btn').first(); await expect(btn).toBeEnabled();
    await page.waitForTimeout(900);
    const t1 = Date.now(); await btn.click();
    await expect(page.getByText(`שאלה ${i + 1} מתוך 30`)).toBeVisible({ timeout: 60_000 });
    gaps.push(Date.now() - t1);
  }
  const fr = await page.evaluate(() => (window as any).__fr as number[]);
  R.answerToNextMs = { median: gaps.sort((a, b) => a - b)[6], worst: Math.max(...gaps) };
  R.frames = { n: fr.length, over50ms: fr.filter(x => x > 50).length, over100ms: fr.filter(x => x > 100).length, worst: Math.round(Math.max(...fr)) };
  R.playLongTasks = await page.evaluate(() => { const a = (window as any).__lt as number[]; return { n: a.length, worst: Math.max(0, ...a) }; });
  R.signsAndImgs = await page.evaluate(() => ({ signImgs: document.querySelectorAll('.q-sign img').length }));
  R.heapMB = await page.evaluate(() => Math.round(((performance as any).memory?.usedJSHeapSize || 0) / 1e6));
  R.errors = errors;
  await context.close();
  return R;
}

test('game speed on slow phones and iPhone', async ({ browser }) => {
  const out = [];
  for (const P of PROFILES.filter(p => !process.env.ONLY || process.env.ONLY.includes(p.name))) out.push(await run(browser, P));
  writeFileSync(test.info().outputPath('perf.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
});
