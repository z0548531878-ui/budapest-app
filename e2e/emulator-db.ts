// Runs the same specs against the real Firestore emulator, with the real Firebase SDK and firestore.rules.
// Each test gets its own emulator project, so tests running side by side don't share rooms or lobbies.
// Used when FIRESTORE_EMULATOR_HOST is set (npm run test:rules).
import type { BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Data = Record<string, any>;
const ROOT = join(__dirname, '..');
const SDK = join(ROOT, 'node_modules', 'firebase');

function decode(v: any): any {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  throw new Error('unknown value ' + JSON.stringify(v));
}
const fields = (f: Data) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decode(v)]));
function encode(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
}

export class EmulatorDb {
  readonly project = 'demo-t' + Math.random().toString(36).slice(2, 10);
  /** Permission errors the SDK reported in any page */
  failures: string[] = [];
  private base: string;
  constructor(private host = process.env.FIRESTORE_EMULATOR_HOST!) {
    this.base = `http://${host}/v1/projects/${this.project}/databases/(default)/documents`;
  }
  private url(path: string) { return this.base + '/' + path.split('/').map(encodeURIComponent).join('/'); }
  private async req(method: string, url: string, body?: any) {
    // "Bearer owner" is the emulator's admin token: it bypasses the rules, for test setup and checks only
    const r = await fetch(url, { method, headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  async init() {
    const content = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
    const r = await fetch(`http://${this.host}/emulator/v1/projects/${this.project}:securityRules`, {
      method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
    });
    if (!r.ok) throw new Error('loading rules failed: ' + (await r.text()));
    return this;
  }

  async get(path: string) { const d = await this.req('GET', this.url(path)); return d ? fields(d.fields || {}) : undefined; }
  async list(col: string) {
    const r = await this.req('GET', this.url(col) + '?pageSize=1000');
    return ((r && r.documents) || []).map((d: any) => ({ id: decodeURIComponent(d.name.split('/').pop()), data: fields(d.fields || {}) }));
  }
  async put(path: string, data: Data) { await this.req('PATCH', this.url(path), { fields: encode(data).mapValue.fields }); }
  async remove(path: string) { await this.req('DELETE', this.url(path)); }

  async attach(context: BrowserContext) {
    const app = readFileSync(join(SDK, 'firebase-app-compat.js'), 'utf8');
    const fs = readFileSync(join(SDK, 'firebase-firestore-compat.js'), 'utf8');
    const [h, port] = this.host.split(':');
    context.on('page', page => page.on('console', m => { if (/permission|PERMISSION_DENIED/.test(m.text())) this.failures.push(m.text()); }));
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('firebase-app-compat')) return route.fulfill({ contentType: 'text/javascript', body: app });
      if (url.includes('firebase-firestore-compat')) return route.fulfill({ contentType: 'text/javascript', body: fs });
      if (url.startsWith('http://localhost:4173/index.html')) {
        const res = await route.fetch();
        const body = (await res.text())
          .replace('projectId: "budapest-983e4"', `projectId: "${this.project}"`)
          .replace('const db = firebase.firestore();', `const db = firebase.firestore(); db.useEmulator('${h}', ${port});`);
        return route.fulfill({ response: res, body });
      }
      if (url.startsWith(`http://${this.host}`) || url.startsWith('http://localhost')) return route.continue();
      if (url.includes('fonts.googleapis')) return route.fulfill({ contentType: 'text/css', body: '' });
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
      return route.abort();
    });
  }
}
