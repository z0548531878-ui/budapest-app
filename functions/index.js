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

exports.tripPush = functions.region('europe-west1').firestore.document('trips/{trip}/{col}/{id}').onWrite(async (change, ctx) => {
  const { trip, col, id } = ctx.params;
  if (trip.length < 24) return;
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  if (!after) return;

  if (col === 'settings') {
    // a change in the programme: to everyone, opens the programme; the same item replaces its earlier notice
    if (after.kind === 'ann' && after.prog && !before) {
      return send(trip, () => true, '⏰ שינוי בלוח המסע', trim(after.text, 140), 'gl', 'prog_' + after.prog);
    }
    // new announcement: for everyone, or (with 'to') only for that participant and their spouse
    if (after.kind === 'ann' && !after.hidden && !(before && before.kind === 'ann' && !before.hidden)) {
      const to = Array.isArray(after.to) ? after.to : [];
      const who = to.length ? r => guests(r) && (r.pids || []).some(p => to.includes(p)) : guests;
      return send(trip, who, (to.length ? 'הודעה אישית מהמארגנים' : 'הודעה מהמארגנים') + (after.title ? ': ' + trim(after.title, 40) : ''), trim(after.text, 140), 'gm', 'ann_' + id);
    }
    // a task for every participant
    if (after.kind === 'gtask' && !after.hidden && !before) {
      return send(trip, guests, 'משימה חדשה לכל המשתתפים', trim(after.title, 100), 'gt', 'gt_' + id);
    }
    // someone joined a shared ride: tell the person who posted it
    if (after.kind === 'ride' && before && !after.hidden) {
      const was = before.join || [], added = (after.join || []).filter(p => !was.includes(p));
      if (added.length) {
        const ps = await Promise.all(added.map(p => db.doc(`trips/${trip}/participants/${p}`).get()));
        const names = ps.map(d => (d.exists && d.data().name) || '').filter(Boolean).join(', ');
        return send(trip, r => guests(r) && (r.pids || []).includes(after.by), 'מצטרפים לנסיעה שלך לשדה', trim((names || 'משתתף') + ' הצטרף/ה לנסיעה' + (after.time ? ' של ' + after.time : ''), 120), 'gd', 'ride_' + id);
      }
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

// Check-in reminder: 24 hours before each flight, everyone on it gets a notification (once per flight).
// Flight times are local: outbound leaves Israel (UTC+2 in November), the return leaves Budapest (UTC+1).
const flightAt = f => {
  const t = String(f.dep || '').replace(/[^\d:]/g, '');
  if (!f.date || !t) return 0;
  return new Date(`${f.date}T${t.padStart(5, '0')}:00${f.dir === 'חזור' ? '+01:00' : '+02:00'}`).getTime();
};
exports.checkinReminder = functions.region('europe-west1').pubsub.schedule('every 15 minutes').onRun(async () => {
  const now = Date.now();
  const flights = await db.collectionGroup('flights').get();
  for (const doc of flights.docs) {
    const f = doc.data(), at = flightAt(f), trip = doc.ref.parent.parent && doc.ref.parent.parent.id;
    if (!trip || trip.length < 24 || f.ciSent || !at || now < at - 864e5 || now >= at) continue;
    const ps = await db.collection(`trips/${trip}/participants`).get();
    const pax = ps.docs.filter(d => {
      const p = d.data();
      return f.dir === 'הלוך' ? (p.outbound || 'קבוצתי') === (f.group || 'קבוצתי') : p.returnGroup === f.group;
    }).map(d => d.id);
    await doc.ref.set({ ciSent: true }, { merge: true });
    if (pax.length) await send(trip, r => guests(r) && (r.pids || []).some(p => pax.includes(p)), '✈ הצ׳ק־אין לטיסה נפתח', 'עשו צ׳ק־אין לטיסה ' + trim(f.flightNo, 12) + ' ושמרו את כרטיס העלייה בטלפון', 'gt', 'ci_' + doc.id);
  }
});
