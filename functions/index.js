// Push notifications for the trip app. Fires whenever a trip document changes.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const trim = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

async function send(trip, filter, title, body, tab, tag) {
  const snap = await db.collection(`trips/${trip}/settings`).where('kind', '==', 'tok').get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.token && filter(r));
  if (!rows.length) return;
  const res = await admin.messaging().sendEachForMulticast({
    tokens: rows.map(r => r.token),
    data: { title, body, tab: tab || '', tag: tag || '' },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });
  // remove tokens that are no longer valid
  const dead = [];
  res.responses.forEach((r, i) => {
    const c = r.error && r.error.code;
    if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') dead.push(rows[i].id);
  });
  await Promise.all(dead.map(id => db.doc(`trips/${trip}/settings/${id}`).delete()));
}

const guests = r => r.role === 'guest';
const orgs = r => r.role === 'org';
const owners = t => String((t && t.owner) || '').split(/,\s*/).map(x => x.trim()).filter(Boolean);

exports.tripPush = functions.firestore.document('trips/{trip}/{col}/{id}').onWrite(async (change, ctx) => {
  const { trip, col, id } = ctx.params;
  if (trip.length < 24) return;
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  if (!after) return;

  if (col === 'settings') {
    // new announcement for everyone
    if (after.kind === 'ann' && !after.hidden && !(before && before.kind === 'ann' && !before.hidden)) {
      return send(trip, guests, 'הודעה מהמארגנים' + (after.title ? ': ' + trim(after.title, 40) : ''), trim(after.text, 140), 'gm', 'ann_' + id);
    }
    // personal request: new one goes to organizers, a status change goes to the requester
    if (after.kind === 'req') {
      if (!before) return send(trip, orgs, 'בקשה אישית חדשה', trim(after.byName + ': ' + after.text, 120), '', 'req_' + id);
      if (before.status !== after.status || before.note !== after.note) {
        return send(trip, r => guests(r) && (r.pids || []).includes(after.by), 'עדכון לבקשה שלך: ' + after.status, trim(after.note || after.text, 120), 'gq', 'rs_' + id);
      }
    }
    return;
  }

  if (col === 'tasks') {
    const was = before || {};
    // a task became open for participants to take
    if (after.open === 'כן' && was.open !== 'כן' && !after.owner && after.status !== 'בוצע') {
      return send(trip, guests, 'משימה חדשה פתוחה', trim(after.title, 100), 'gt', 'to_' + id);
    }
    // somebody asked to take a task
    if (after.claimStatus === 'ממתין לאישור' && was.claimStatus !== 'ממתין לאישור') {
      return send(trip, orgs, 'בקשה לקחת משימה', trim((after.claimBy || '') + ': ' + after.title, 120), '', 'cl_' + id);
    }
    // a task was assigned to someone
    const newly = owners(after).filter(o => !owners(was).includes(o));
    if (newly.length) {
      return send(trip, r => guests(r) && (r.names || []).some(n => newly.includes(n)), 'משימה חדשה בשבילך', trim(after.title, 100), 'gt', 'ow_' + id);
    }
  }
});
