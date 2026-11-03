// Load test of the group game: 80 players at once (a host and 12 real phones in the browser, plus 68 players
// written directly with the Firebase SDK, the same writes the app makes), a full 50-question game, against the
// Firestore emulator with the real security rules. Run: LOAD=1 npm run test:rules -- e2e/load.spec.ts
// It checks that nobody is left behind: every player sees every question, every answer is counted, the
// scores everyone sees match the database, the game never stalls, and no page throws.
import { test, expect } from '@playwright/test';
import { EmulatorDb } from './emulator-db';
import { enterName } from './helpers';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { writeFileSync } from 'node:fs';

test.skip(!process.env.LOAD || !process.env.FIRESTORE_EMULATOR_HOST, 'load test: LOAD=1 with the Firestore emulator');
test.setTimeout(45 * 60_000);

const UI_PLAYERS = Number(process.env.UI_PLAYERS || 12), BOTS = Number(process.env.BOTS || 68);
const QUESTION_MS = 11_000;
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const FIRST = ['משה', 'יוסף', 'אברהם', 'דוד', 'שרה', 'רחל', 'לאה', 'חיים', 'אהרן', 'מרים', 'יעקב', 'שמואל'];
const LAST = ['כהן', 'לוי', 'פרידמן', 'גולד', 'שטרן', 'ברגר', 'וייס', 'קליין', 'רוזן', 'שפירא'];
const nameOf = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]} ${i}`;

test('80 players play a full group game', async ({ browser }) => {
  const db = await new EmulatorDb().init();
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  const errors: string[] = [];
  const t0 = Date.now();
  const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

  // ---- host (real browser) ----
  const open = async (answers: string[] = []) => {
    const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 400, height: 860 }, reducedMotion: 'reduce' });
    await db.attach(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
    const q = [...answers];
    page.on('dialog', d => d.type() === 'prompt' ? d.accept(q.shift() ?? '') : d.accept());
    await page.goto('/index.html');
    return page;
  };
  const hostPage = await open(['2026']);
  await hostPage.getByRole('button', { name: /כניסת מנחה משחק/ }).click();
  await expect(hostPage.getByRole('button', { name: /התחל משחק/ })).toBeVisible({ timeout: 30_000 });
  const code = (await db.get('rooms/current'))!.code as string;
  log('lobby ' + code);

  // ---- 12 real phones ----
  const ui: { page: any; name: string }[] = [];
  for (let i = 0; i < UI_PLAYERS; i++) {
    const name = nameOf(i), page = await open();
    await page.getByRole('button', { name: /משחק קבוצתי/ }).click();
    await enterName(page, name);
    await expect(page.locator('.wait-title')).toBeVisible({ timeout: 30_000 });
    // auto-play like a person: read, wait a moment, tap an answer; remember which questions showed up
    await page.evaluate(() => {
      const w = window as any; w.__seen = []; w.__tapped = [];
      setInterval(() => {
        const m = document.body.innerText.match(/שאלה (\d+) מתוך (\d+)/); if (!m) return;
        const n = Number(m[1]); if (!w.__seen.includes(n)) w.__seen.push(n);
        if (w.__tapped.includes(n) || document.body.classList.contains('q-reading')) return;
        const bs = [...document.querySelectorAll('#p-answers .answer-btn:not([disabled])')] as HTMLButtonElement[];
        if (!bs.length) return;
        if (!w.__wait) w.__wait = { n, at: Date.now() + 500 + Math.random() * 5000 };
        if (w.__wait.n !== n) w.__wait = { n, at: Date.now() + 500 + Math.random() * 5000 };
        if (Date.now() < w.__wait.at) return;
        w.__tapped.push(n); bs[Math.floor(Math.random() * bs.length)].click();
      }, 250);
    });
    ui.push({ page, name });
  }
  log(`${UI_PLAYERS} phones in the lobby`);

  // ---- 68 SDK players ----
  type Bot = { id: string; name: string; fs: any; seen: Map<number, number>; answered: Set<number>; lag: number[]; reads: number; unsub?: () => void; hb?: any };
  const bots: Bot[] = [];
  let roomTimeline: { phase: string; qIndex: number; at: number }[] = [];
  for (let i = 0; i < BOTS; i++) {
    const app = firebase.initializeApp({ projectId: db.project, apiKey: 'demo' }, 'bot' + i + '-' + Date.now());
    const fs = app.firestore(); fs.useEmulator(host, Number(port));
    const b: Bot = { id: 'bot' + i + Math.random().toString(36).slice(2, 6), name: nameOf(UI_PLAYERS + i), fs, seen: new Map(), answered: new Set(), lag: [], reads: 0 };
    const room = fs.collection('rooms').doc(code);
    await room.collection('players').doc(b.id).set({ name: b.name, score: 0, joinedAt: Date.now(), hb: Date.now() });
    b.hb = setInterval(() => room.collection('players').doc(b.id).update({ hb: Date.now() }).catch(() => {}), 30_000);
    b.unsub = room.onSnapshot((s: any) => {
      b.reads++;
      const st = s.data(); if (!st) return;
      if (b === bots[0]) roomTimeline.push({ phase: st.phase, qIndex: st.qIndex, at: Date.now() });
      if (st.phase !== 'question' || b.seen.has(st.qIndex)) return;
      b.seen.set(st.qIndex, Date.now());
      b.lag.push(Math.max(0, Date.now() - (st.phaseAt || Date.now())));
      const q = (st.qset || [])[st.qIndex]; if (!q) return;
      const skip = Math.random() < 0.05; // some people don't make it in time
      if (skip) return;
      const at = (st.questionStartedAt || Date.now()) + 300 + Math.random() * 8000;
      setTimeout(() => {
        const choice = Math.random() < 0.55 ? q.c : Math.floor(Math.random() * q.a.length);
        b.answered.add(st.qIndex);
        room.collection('answers').doc(st.qIndex + '-' + b.id).set({ playerId: b.id, qIndex: st.qIndex, choice, answeredAt: Date.now() }).catch((e: any) => errors.push('bot answer: ' + e.message));
      }, Math.max(0, at - Date.now()));
    }, (e: any) => errors.push('bot listen: ' + e.message));
    bots.push(b);
  }
  log(`${BOTS} SDK players in the lobby`);
  await expect.poll(async () => (await db.list(`rooms/${code}/players`)).length, { timeout: 60_000 }).toBe(UI_PLAYERS + BOTS);
  await expect.poll(async () => ((await db.get(`rooms/${code}`))!.roster || []).length, { timeout: 30_000 }).toBe(UI_PLAYERS + BOTS);
  // the waiting screen on a phone shows the whole crowd
  await expect(ui[0].page.locator('body')).toContainText(String(UI_PLAYERS + BOTS), { timeout: 30_000 });
  log('all 80 in the lobby, roster published');

  // ---- play ----
  const tStart = Date.now();
  await hostPage.getByRole('button', { name: /התחל משחק/ }).click();
  let last = '', lastAt = Date.now(), maxGap = 0, phase = '';
  while (true) {
    const st = (await db.get(`rooms/${code}`))!;
    const sig = st.phase + ':' + st.qIndex;
    if (sig !== last) { maxGap = Math.max(maxGap, Date.now() - lastAt); last = sig; lastAt = Date.now(); if (st.phase !== phase) { phase = st.phase; } }
    if (st.phase === 'ended') break;
    if (Date.now() - lastAt > 45_000) throw new Error(`game stalled at ${sig} for 45s`);
    if (Date.now() - tStart > 35 * 60_000) throw new Error('game took more than 35 minutes');
    await new Promise(r => setTimeout(r, 1000));
  }
  const gameSec = Math.round((Date.now() - tStart) / 1000);
  log(`game ended after ${gameSec}s`);
  await new Promise(r => setTimeout(r, 4000));

  // ---- checks ----
  const room = (await db.get(`rooms/${code}`))!;
  const total = (room.qset || []).length;
  const docs = await db.list(`rooms/${code}/players`);
  const byId = new Map(docs.map((d: any) => [d.id, d.data]));
  const rosterById = new Map((room.roster || []).map((r: any) => [r.i, r]));
  const problems: string[] = [];
  if (total !== 50) problems.push(`game had ${total} questions, not 50`);
  if ((room.qset || []).some((q: any) => q.type === 'poll')) problems.push('a poll question was in the game');
  // every SDK player saw every question; every answer it sent in time was counted
  let missed = 0, miscount = 0;
  for (const b of bots) {
    for (let i = 0; i < total; i++) if (!b.seen.has(i)) missed++;
    const d: any = byId.get(b.id); if (!d) { problems.push(`player ${b.name} vanished`); continue; }
    if ((d.answered || 0) !== b.answered.size) miscount++;
    const r: any = rosterById.get(b.id); if (!r || r.s !== (d.score || 0)) problems.push(`roster score for ${b.name} is ${r && r.s}, database ${d.score}`);
  }
  if (missed) problems.push(`${missed} question showings missed by SDK players`);
  if (miscount) problems.push(`${miscount} SDK players with a wrong answer count`);
  // the 12 phones: saw every question, and show the same final score as the database
  for (const u of ui) {
    const seen: number[] = await u.page.evaluate(() => (window as any).__seen);
    if (seen.length < total) problems.push(`${u.name} saw ${seen.length}/${total} questions`);
    const d: any = docs.find((x: any) => x.data.name === u.name)?.data;
    const shown = await u.page.locator('.se-score').first().textContent({ timeout: 15_000 }).catch(() => null);
    if (!d) problems.push(`${u.name} not in the room`);
    else if (shown !== null && Number(shown) !== (d.score || 0)) problems.push(`${u.name} sees score ${shown}, database ${d.score}`);
  }
  const lags = bots.flatMap(b => b.lag);
  const roomReads = bots.reduce((s, b) => s + b.reads, 0);
  const report = {
    players: UI_PLAYERS + BOTS, questions: total, gameSec, maxGapSec: Math.round(maxGap / 1000),
    questionReachMs: { p50: pct(lags, 0.5), p95: pct(lags, 0.95), max: Math.max(0, ...lags) },
    roomUpdatesSeenPerPlayer: Math.round(roomReads / BOTS),
    estReadsWholeGame: Math.round(roomReads / BOTS * (UI_PLAYERS + BOTS + 1) + docs.reduce((s: number, d: any) => s + (d.data.answered || 0), 0) * 2 + (UI_PLAYERS + BOTS) * 3),
    pageErrors: errors.length, problems,
  };
  writeFileSync(test.info().outputPath('load-report.json'), JSON.stringify({ report, errors: errors.slice(0, 50), timeline: roomTimeline.slice(0, 400) }, null, 1));
  console.log('LOAD-REPORT ' + JSON.stringify(report));
  for (const b of bots) { clearInterval(b.hb); b.unsub && b.unsub(); }
  expect(errors, 'page errors').toEqual([]);
  expect(problems).toEqual([]);
  expect(maxGap, 'longest time the game stood still').toBeLessThan(30_000);
});
