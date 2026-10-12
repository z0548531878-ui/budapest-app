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
      const who = to.length ? r => guests(r) && ((r.pids || []).some(p => to.includes(p)) || to.includes(r.by)) : guests;
      return send(trip, who, (to.length ? 'הודעה אישית מהמארגנים' : 'הודעה מהמארגנים') + (after.title ? ': ' + trim(after.title, 40) : ''), trim(after.text, 140), 'gm', 'ann_' + id);
    }
    // the moment of the day: an organizer starred a photo
    if (after.kind === 'moment' && !after.hidden && (!before || before.pid !== after.pid)) {
      return send(trip, () => true, '⭐ הרגע של היום', after.byName ? 'צילום: ' + trim(after.byName, 40) + '. היכנסו לראות' : 'היכנסו לראות את התמונה שנבחרה', 'gh', 'moment');
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

// Trip photos: one notification per burst of uploads. The first new photo opens a 5-minute window;
// photos uploaded during it are only counted. When the window ends, everyone gets one notification
// (except the uploader, when a single person uploaded them all). The window lives in photoq/{trip}, server only.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PHOTO_WAIT = 5 * 60 * 1000;
exports.photoPush = functions.region('europe-west1').runWith({ timeoutSeconds: 420 })
  .firestore.document('trips/{trip}/photos/{id}').onCreate(async (snap, ctx) => {
    const { trip } = ctx.params;
    if (trip.length < 24) return;
    const p = snap.data() || {};
    if (p.hidden) return;
    const ref = db.doc(`photoq/${trip}`);
    const lead = await db.runTransaction(async tx => {
      const d = await tx.get(ref), q = d.exists ? d.data() : null, now = Date.now();
      // a window is open (a crashed one is ignored after 10 minutes): just count this photo
      if (q && q.open && now - (q.start || 0) < 2 * PHOTO_WAIT) {
        tx.update(ref, { count: admin.firestore.FieldValue.increment(1), names: admin.firestore.FieldValue.arrayUnion(trim(p.byName, 40) || 'מישהו'), bys: admin.firestore.FieldValue.arrayUnion(p.by || '') });
        return false;
      }
      tx.set(ref, { open: true, start: now, count: 1, names: [trim(p.byName, 40) || 'מישהו'], bys: [p.by || ''] });
      return true;
    });
    if (!lead) return;
    await sleep(PHOTO_WAIT);
    const q = await db.runTransaction(async tx => {
      const d = await tx.get(ref), v = d.exists ? d.data() : {};
      tx.set(ref, { open: false, sentAt: Date.now() }, { merge: true });
      return v;
    });
    const n = q.count || 1, names = (q.names || []).filter(Boolean), bys = (q.bys || []);
    const who = names.length <= 2 ? names.join(' ו') : names.slice(0, 2).join(', ') + ` ועוד ${names.length - 2}`;
    const one = bys.length === 1 && bys[0] ? bys[0] : '';
    return send(trip, r => !(one && (r.by === one)), n === 1 ? '📷 תמונה חדשה בגלריה' : `📷 ${n} תמונות חדשות בגלריה`, (who || 'משתתפי המסע') + (n === 1 ? ' העלה/תה תמונה. היכנסו לראות' : ' העלו תמונות. היכנסו לראות'), 'gi', 'photos');
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

// ---------- Trivia game (the root page / the trivia app in /play): notifications to whoever turned them on ----------
// tokens: trivia_push/{id} = {token, name, at, on}. Sent: someone entered the head-to-head lobby (waiting for an opponent),
// and a host opened a group-game lobby (the game is about to start). trivia_meta holds the last send time, so a player
// who leaves and comes back doesn't spam everyone.
async function sendTrivia(skipName, title, body, url, tag) {
  const snap = await db.collection('trivia_push').get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.token && r.on !== false && (!skipName || r.name !== skipName));
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: part.map(r => r.token),
      data: { title, body, url: url || '', tag: tag || '' },
      webpush: { headers: { Urgency: 'high', TTL: '1800' } },
    });
    const dead = [];
    res.responses.forEach((r, k) => {
      const c = r.error && r.error.code;
      if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') dead.push(part[k].id);
    });
    await Promise.all(dead.map(id => db.doc(`trivia_push/${id}`).delete()));
  }
}
async function triviaThrottle(key, ms) {
  const ref = db.doc(`trivia_meta/${key.replace(/[\/.#$\[\]\s]/g, '_').slice(0, 120)}`);
  return db.runTransaction(async tx => {
    const d = await tx.get(ref), last = d.exists ? d.data().at || 0 : 0;
    if (Date.now() - last < ms) return false;
    tx.set(ref, { at: Date.now() });
    return true;
  });
}
exports.triviaPush = functions.region('europe-west1').firestore.document('rooms/{room}').onWrite(async (change, ctx) => {
  const room = ctx.params.room;
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  if (!after) return;
  if (room === 'duel_lobby') {
    const was = (before && before.players) || {}, now = after.players || {};
    const fresh = Object.keys(now).filter(id => !was[id] && now[id] && now[id].name);
    for (const id of fresh) {
      const name = trim(now[id].name, 40);
      if (!(await triviaThrottle('duel_' + name, 10 * 60 * 1000))) continue;
      await sendTrivia(name, '⚔️ מחכים לכם לראש בראש', `${name} בחדר ההמתנה של ראש בראש — היכנסו והזמינו לדו-קרב!`, '#duel', 'trv_duel');
    }
    return;
  }
  // group-game rooms have a 4-digit code; a new lobby means a host is about to start a game
  if (/^\d{4}$/.test(room) && after.phase === 'lobby' && (!before || before.phase !== 'lobby')) {
    if (!(await triviaThrottle('group_' + room, 30 * 60 * 1000))) return;
    return sendTrivia('', '👥 משחק קבוצתי עומד להתחיל!', 'המנחה פתח חדר המתנה — היכנסו עכשיו ושחקו עם כולם', '#group', 'trv_group');
  }
});
