// Realistic trip data for the measurement and screenshot specs (not used by the regular tests).
import { TRIP as T, type Db } from './helpers';

const FIRST = ['אבי', 'בני', 'גלעד', 'דוד', 'הדס', 'ורד', 'זיו', 'חנה', 'טל', 'יעל', 'כרמל', 'לאה', 'מיכל', 'נועה', 'עדי'];
const LAST = ['כהן', 'לוי', 'מור', 'פז', 'רוזן', 'שגיא', 'ברק', 'גולד'];
/** A realistic trip: 60 participants (some couples), tasks, expenses, rooms, packing, schedule, announcements. */
export async function seedBigTrip(db: Db) {
  const put = (p: string, d: object) => db.put(`${T}/${p}`, d);
  await put('settings/trip', { team: ['שלומי', 'איציק', 'יעל'] });
  for (let i = 0; i < 60; i++) {
    const st = ['שולם', 'שולם', 'לא שולם', 'שולם חלקית'][i % 4];
    const couple = i < 24, mate = couple ? (i % 2 ? i - 1 : i + 1) : -1;
    await put(`participants/p${i}`, { name: `${FIRST[i % 15]} ${LAST[i % 8]}${i > 14 ? ' ' + i : ''}`, amount: 1750, phone: '05012345' + String(i).padStart(2, '0'),
      status: st, paidAmt: st === 'שולם חלקית' ? 500 : 0, holder: i % 2 ? 'שלומי' : 'איציק', passport: i % 3 !== 0, outbound: 'קבוצתי', returnGroup: ['מוצ״ש', 'ראשון צהריים', 'ראשון ערב'][i % 3], order: i,
      gender: i % 2 ? 'אישה' : 'גבר', ...(couple ? { spouse: `p${mate}`, roomId: `r${Math.floor(i / 2)}` } : {}) });
  }
  for (let i = 0; i < 6; i++) await put(`tasks/o${i}`, { title: ['לסחוב מזוודת ציוד', 'לחלק מים באוטובוס', 'לעזור בעריכת השולחנות', 'לקרוא בתורה', 'לצלם בסעודה', 'לחלק עלונים'][i], open: 'כן', status: 'לביצוע', priority: 'רגילה', category: 'אחר', due: '', notes: 'אפשר להתנדב', order: 100 + i });
  await put('settings/ann_1', { kind: 'ann', title: 'שינוי בשעת היציאה', text: 'היציאה לקרעסטיר מוקדמת בחצי שעה: 11:30 בלובי.', ts: Date.now() - 3600e3 });
  await put('settings/ann_2', { kind: 'ann', title: 'דרכונים', text: 'נא לשלוח צילום דרכון עד יום ראשון.', ts: Date.now() - 86400e3 * 2 });
  await put('settings/req_1', { kind: 'req', by: 'p2', cat: 'אוכל', text: 'מנה ללא גלוטן בבקשה', status: 'בטיפול', note: 'סגרנו עם המסעדה', ts: Date.now() - 7200e3 });
  await put('settings/req_2', { kind: 'req', by: 'p8', cat: 'חדר', text: 'חדר בקומה נמוכה אם אפשר', status: 'חדש', ts: Date.now() - 600e3 });
  await put('donations/d1', { donor: 'משפחת רוזן', amount: 1800, status: 'התקבל', holder: 'שלומי', purpose: 'כללי', order: 1 });
  await put('donations/d2', { donor: 'קרן חסד', amount: 3600, status: 'התחייב', purpose: 'הדפסות', order: 2 });
  for (let i = 0; i < 40; i++) await put(`tasks/t${i}`, { title: `משימה מספר ${i}`, owner: ['שלומי', 'איציק', 'יעל'][i % 3], status: ['לביצוע', 'בתהליך', 'ממתין', 'בוצע'][i % 4], priority: i % 5 ? 'רגילה' : 'גבוהה', category: 'אחר', due: '', notes: '', order: i });
  for (let i = 0; i < 25; i++) await put(`expenses/e${i}`, { name: `הוצאה ${i}`, category: ['לינה', 'אוכל', 'הסעות', 'אחר'][i % 4], estimate: 1000 + i * 100, paid: i % 2 ? 500 : 0, status: i % 2 ? 'מקדמה' : 'לא שולם', paidBy: 'איציק', order: i });
  for (let i = 0; i < 30; i++) await put(`rooms/r${i}`, { occupants: `${FIRST[i % 15]} ${LAST[i % 8]}`, roomNumber: String(400 + i), floor: '4', entrance: 'בניין A', type: 'חדר לזוג', kitReady: i % 2 === 0, order: i });
  for (let i = 0; i < 40; i++) await put(`packing/k${i}`, { item: `פריט ${i}`, qty: 10, list: 'שבת', where: i % 2 ? 'בארץ' : 'בבודפשט', done: i % 3 === 0, order: i });
  for (let i = 0; i < 12; i++) await put(`schedule/s${i}`, { day: ['יום חמישי', 'יום שישי', 'שבת'][i % 3], time: `${8 + i}:00`, title: `אירוע ${i}`, place: 'מלון', order: i });
  await put('flights/f1', { label: 'קבוצתי', dir: 'הלוך', group: 'קבוצתי', flightNo: 'LY 2369', date: '2026-11-19', dep: '08:40', arr: '11:15' });
  for (let i = 0; i < 30; i++) await put(`activity/a${i}`, { by: 'יעל', at: `2026-10-0${1 + (i % 8)}T10:${String(i).padStart(2, '0')}:00Z`, act: 'edit', col: 'tasks', rid: `t${i}`, title: `משימה מספר ${i}` });
}

