// An in-memory stand-in for the Firebase compat SDK, shared by every page in a test.
// The pages never reach the real Firestore, so tests can't touch the live leaderboards,
// and several browser contexts (host, players, duel opponents) see the same data.
import type { BrowserContext, Page } from '@playwright/test';

type Data = Record<string, any>;
type Where = [string, string, any];
type Query = { col: string; wheres: Where[]; order: [string, string] | null; limit: number | null };
type Spec = { kind: 'doc'; path: string } | ({ kind: 'query' } & Query);
type Write = { op: 'set' | 'update' | 'delete'; path: string; data?: Data; merge?: boolean };

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isFv = (v: any) => v && typeof v === 'object' && '__fv' in v;
const isMap = (v: any) => v && typeof v === 'object' && !Array.isArray(v) && !isFv(v);

function resolve(cur: any, v: any): any {
  if (!isFv(v)) return clone(v);
  if (v.__fv === 'inc') return (typeof cur === 'number' ? cur : 0) + v.n;
  if (v.__fv === 'union') return [...(Array.isArray(cur) ? cur : []), ...v.arr.filter((x: any) => !(cur || []).includes(x))];
  if (v.__fv === 'ts') return Date.now();
  throw new Error('unknown sentinel ' + v.__fv);
}
function setPath(obj: Data, path: string[], v: any) {
  let o = obj;
  for (const k of path.slice(0, -1)) { if (!isMap(o[k])) o[k] = {}; o = o[k]; }
  const last = path[path.length - 1];
  if (isFv(v) && v.__fv === 'delete') delete o[last]; else o[last] = resolve(o[last], v);
}
function mergeInto(obj: Data, src: Data) {
  for (const [k, v] of Object.entries(src)) {
    if (isMap(v)) { if (!isMap(obj[k])) obj[k] = {}; mergeInto(obj[k], v); }
    else setPath(obj, [k], v);
  }
}

export class FakeFirestore {
  docs = new Map<string, { data: Data; v: number }>();
  private listeners = new Map<string, { page: Page; spec: Spec; last: string }>();
  private seq = 0;
  /** Every write that failed, so a test can assert the app never hit one. */
  failures: string[] = [];

  get(path: string) { return clone(this.docs.get(path)?.data); }
  put(path: string, data: Data) { this.commit([{ op: 'set', path, data }]); }
  remove(path: string) { this.commit([{ op: 'delete', path }]); }
  list(col: string) { return this.runQuery({ col, wheres: [], order: null, limit: null }); }

  private runQuery(q: Query) {
    let out = [...this.docs.entries()]
      .filter(([p]) => p.startsWith(q.col + '/') && !p.slice(q.col.length + 1).includes('/'))
      .map(([p, d]) => ({ id: p.slice(q.col.length + 1), data: clone(d.data) }));
    for (const [f, op, val] of q.wheres) {
      out = out.filter(d => {
        const x = d.data[f];
        if (op === '==') return x === val;
        if (op === '>') return x !== undefined && x > val;
        if (op === '<') return x !== undefined && x < val;
        throw new Error('unsupported where op ' + op);
      });
    }
    if (q.order) {
      const [f, dir] = q.order;
      out = out.filter(d => d.data[f] !== undefined)
        .sort((a, b) => (a.data[f] < b.data[f] ? -1 : a.data[f] > b.data[f] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    if (q.limit != null) out = out.slice(0, q.limit);
    return out;
  }

  private snapshot(spec: Spec) {
    if (spec.kind === 'doc') { const d = this.docs.get(spec.path); return { exists: !!d, data: clone(d?.data) }; }
    return this.runQuery(spec);
  }

  commit(writes: Write[], reads: Record<string, number> = {}) {
    for (const [p, v] of Object.entries(reads)) if ((this.docs.get(p)?.v ?? 0) !== v) return { conflict: true };
    // Validate everything first, so a batch applies all or nothing, like Firestore
    for (const w of writes) {
      if (w.op === 'update' && !this.docs.has(w.path)) {
        const msg = `NOT_FOUND: update on missing document ${w.path}`;
        this.failures.push(msg);
        return { error: msg };
      }
    }
    for (const w of writes) {
      const cur = this.docs.get(w.path);
      if (w.op === 'delete') { this.docs.delete(w.path); continue; }
      let data: Data;
      if (w.op === 'set' && !w.merge) { data = {}; mergeInto(data, w.data!); }
      else if (w.op === 'set') { data = clone(cur?.data) || {}; mergeInto(data, w.data!); }
      else { data = clone(cur!.data); for (const [k, v] of Object.entries(w.data!)) setPath(data, k.split('.'), v); }
      this.docs.set(w.path, { data, v: (cur?.v ?? 0) + 1 });
    }
    this.notify();
    return { ok: true };
  }

  private notify() {
    for (const [id, l] of this.listeners) this.push(id, l);
  }
  private push(id: string, l: { page: Page; spec: Spec; last: string }) {
    const snap = this.snapshot(l.spec), json = JSON.stringify(snap);
    if (json === l.last) return;
    l.last = json;
    if (l.page.isClosed()) { this.listeners.delete(id); return; }
    l.page.evaluate(([i, s]) => (window as any).__fsPush(i, s), [id, snap] as const).catch(() => this.listeners.delete(id));
  }

  private handle(page: Page, op: string, a: any) {
    switch (op) {
      case 'getDoc': { const d = this.docs.get(a.path); return { exists: !!d, data: clone(d?.data), v: d?.v ?? 0 }; }
      case 'query': return this.runQuery(a);
      case 'commit': return this.commit(a.writes, a.reads);
      case 'listen': { const id = 'l' + ++this.seq; const l = { page, spec: a, last: '' }; this.listeners.set(id, l); setTimeout(() => this.push(id, l), 0); return id; }
      case 'unlisten': this.listeners.delete(a.id); return true;
    }
    throw new Error('unknown op ' + op);
  }

  /** Wire a browser context to this store: stub the Firebase scripts and keep the test offline. */
  async attach(context: BrowserContext) {
    await context.exposeBinding('__fsCall', ({ page }, op: string, args: any) => this.handle(page, op, args));
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('http://localhost')) return route.continue();
      if (url.includes('firebase-app-compat')) return route.fulfill({ contentType: 'text/javascript', body: SHIM });
      if (url.includes('firebasejs')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (url.includes('fonts.googleapis')) return route.fulfill({ contentType: 'text/css', body: '' });
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: PNG });
      return route.abort();
    });
  }
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// Runs in the page, in place of firebase-app-compat.js
const SHIM = String.raw`(() => {
  const call = (op, a) => window.__fsCall(op, a);
  const subs = {};
  window.__fsPush = (id, s) => { const cb = subs[id]; if (cb) cb(s); };
  const docSnap = (ref, r) => ({ id: ref.id, ref, exists: !!r.exists, data: () => r.exists ? JSON.parse(JSON.stringify(r.data)) : undefined });
  const querySnap = (col, rows) => { const docs = rows.map(r => docSnap(col.doc(r.id), { exists: true, data: r.data })); return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) }; };
  const enc = d => JSON.parse(JSON.stringify(d === undefined ? {} : d));
  function listen(spec, wrap, cb, err) {
    let id = null, dead = false;
    call('listen', spec).then(i => { if (dead) { call('unlisten', { id: i }); return; } id = i; subs[i] = s => cb(wrap(s)); }).catch(e => err && err(e));
    return () => { dead = true; if (id) { delete subs[id]; call('unlisten', { id }); } };
  }
  async function commit(writes, reads) {
    const r = await call('commit', { writes, reads: reads || {} });
    if (r.error) throw Object.assign(new Error(r.error), { code: 'not-found' });
    return r;
  }
  class DocRef {
    constructor(path) { this.path = path; this.id = path.split('/').pop(); }
    collection(n) { return new ColRef(this.path + '/' + n); }
    async get() { return docSnap(this, await call('getDoc', { path: this.path })); }
    set(d, o) { return commit([{ op: 'set', path: this.path, data: enc(d), merge: !!(o && o.merge) }]).then(() => {}); }
    update(d) { return commit([{ op: 'update', path: this.path, data: enc(d) }]).then(() => {}); }
    delete() { return commit([{ op: 'delete', path: this.path }]).then(() => {}); }
    onSnapshot(cb, err) { return listen({ kind: 'doc', path: this.path }, s => docSnap(this, s), cb, err); }
  }
  class ColRef {
    constructor(path, q) { this.path = path; this.q = q || { col: path, wheres: [], order: null, limit: null }; }
    doc(id) { return new DocRef(this.path + '/' + id); }
    where(f, op, v) { return new ColRef(this.path, { ...this.q, wheres: [...this.q.wheres, [f, op, v]] }); }
    orderBy(f, dir) { return new ColRef(this.path, { ...this.q, order: [f, dir || 'asc'] }); }
    limit(n) { return new ColRef(this.path, { ...this.q, limit: n }); }
    async get() { return querySnap(this, await call('query', this.q)); }
    onSnapshot(cb, err) { return listen({ kind: 'query', ...this.q }, s => querySnap(this, s), cb, err); }
  }
  const db = {
    collection: n => new ColRef(n),
    batch() { const w = []; return {
      set: (r, d, o) => { w.push({ op: 'set', path: r.path, data: enc(d), merge: !!(o && o.merge) }); },
      update: (r, d) => { w.push({ op: 'update', path: r.path, data: enc(d) }); },
      delete: r => { w.push({ op: 'delete', path: r.path }); },
      commit: () => commit(w).then(() => {}) }; },
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const reads = {}, writes = [];
        const tx = {
          get: async r => { const s = await call('getDoc', { path: r.path }); reads[r.path] = s.v; return docSnap(r, s); },
          set: (r, d, o) => { writes.push({ op: 'set', path: r.path, data: enc(d), merge: !!(o && o.merge) }); return tx; },
          update: (r, d) => { writes.push({ op: 'update', path: r.path, data: enc(d) }); return tx; },
          delete: r => { writes.push({ op: 'delete', path: r.path }); return tx; },
        };
        const out = await fn(tx);
        const r = await commit(writes, reads);
        if (!r.conflict) return out;
      }
      throw new Error('transaction contention');
    },
  };
  const firestore = () => db;
  firestore.FieldValue = {
    increment: n => ({ __fv: 'inc', n }),
    arrayUnion: (...arr) => ({ __fv: 'union', arr }),
    delete: () => ({ __fv: 'delete' }),
    serverTimestamp: () => ({ __fv: 'ts' }),
  };
  window.firebase = { initializeApp: () => ({}), firestore };
})();`;
