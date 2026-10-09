import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeFirestore } from './fake-firestore';
import { EmulatorDb } from './emulator-db';

export { expect };

export type Player = { page: Page; errors: string[]; dialogs: string[] };
/** The in-memory stand-in by default; the real emulator with firestore.rules when FIRESTORE_EMULATOR_HOST is set */
export type Db = FakeFirestore | EmulatorDb;

/** Opens the app in a fresh browser context (its own localStorage, like a separate phone). */
export async function openPlayer(browser: Browser, db: Db, opts: { answers?: string[]; path?: string; reducedMotion?: boolean; setup?: (c: BrowserContext) => Promise<void> } = {}): Promise<Player> {
  const context = await browser.newContext(opts.reducedMotion ? { reducedMotion: 'reduce' } : {});
  await db.attach(context);
  if (opts.setup) await opts.setup(context);
  const page = await context.newPage();
  const errors: string[] = [], dialogs: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  // a transaction that loses a race is retried by the SDK; the browser still logs its rejected request
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  const answers = [...(opts.answers || [])];
  page.on('dialog', d => { dialogs.push(d.message()); d.type() === 'prompt' ? d.accept(answers.shift() ?? '') : d.accept(); });
  await page.goto(opts.path || '/index.html');
  return { page, errors, dialogs };
}

export const test = base.extend<{ db: Db }>({
  db: async ({}, use) => {
    const db = process.env.FIRESTORE_EMULATOR_HOST ? await new EmulatorDb().init() : new FakeFirestore();
    await use(db);
    if (db instanceof EmulatorDb) expect(db.failures, 'requests the security rules refused').toEqual([]);
  },
});

export async function enterName(page: Page, name: string) {
  const input = page.locator('.screen.active').getByLabel('כתבו כאן שם ושם משפחה');
  await input.fill(name);
  await input.press('Enter');
}

/** axe scan of the current screen; returns the serious/critical violations so specs can assert on them. */
export async function a11y(page: Page, tags?: string[], skip: string[] = []) {
  const axe = new AxeBuilder({ page }).disableRules(skip);
  const r = await (tags ? axe.withTags(tags) : axe).analyze();
  return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
}

/** The trip app turns off pinch-zoom on purpose (an organizers' decision, 9.10), so its specs skip that one axe rule. */
export const TRIP_AXE_SKIP = ['meta-viewport'];
/** The trip app (/trip) on its own test trip: the team key and "who am I" already on the phone, no splash or guide. */
export const TRIP_KEY = 'test-trip-key-0123456789abcdef';
export const TRIP = `trips/${TRIP_KEY}`;
export async function openTrip(browser: Browser, db: Db, me = 'שלומי'): Promise<Player> {
  const xlsx = readFileSync(join(__dirname, '..', 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), 'utf8');
  const p = await openPlayer(browser, db, { path: '/trip/index.html', reducedMotion: true, setup: async context => {
    // the Excel library comes from cdnjs on the real site; here it comes from node_modules
    await context.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: xlsx }));
    await context.addInitScript(([k, m]) => {
      localStorage.setItem('tripKey', k); localStorage.setItem('me', m); localStorage.setItem('guideDone', '1');
      sessionStorage.setItem('splash', '1');
    }, [TRIP_KEY, me]);
  } });
  p.page.on('response', r => { if (r.status() >= 500) p.errors.push(`${r.status()} ${r.url()}`); });
  // every list has arrived (from the emulator this takes a moment)
  await expect.poll(() => p.page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  return p;
}
