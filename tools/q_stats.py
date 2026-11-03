# Read-only: how often each question was answered right, from every duel and group game saved in Firestore.
# (Solo rounds don't save per-question answers, so they aren't in here.)  Output: out/q_stats.csv
import json, re, csv, os, subprocess, urllib.request, urllib.parse
BASE = 'https://firestore.googleapis.com/v1/projects/budapest-983e4/databases/(default)/documents/'
def val(v):
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return v['doubleValue']
    if 'booleanValue' in v: return v['booleanValue']
    if 'nullValue' in v: return None
    if 'arrayValue' in v: return [val(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v: return {k: val(x) for k, x in v['mapValue'].get('fields', {}).items()}
    return None
def listdocs(path):
    out, tok = [], ''
    while True:
        u = BASE + path + '?pageSize=300' + ('&pageToken=' + urllib.parse.quote(tok) if tok else '')
        try: d = json.load(urllib.request.urlopen(u))
        except Exception as e: print('skip', path, e); return out
        out += d.get('documents', []); tok = d.get('nextPageToken')
        if not tok: return out
import traceback, sys
LIVE = 1793723400  # from this release every answer is counted live in rooms/qstats_*; older games are read from their rooms
def main():
    # topic of each bank question, by its text
    h = open('index.html', encoding='utf-8').read()
    TOP = {}
    for m in re.finditer(r"\{topic:(T\d+), q:'((?:[^'\\]|\\.)*)'", h): TOP.setdefault(m.group(2).replace("\\'", "'"), m.group(1))
    NAMES = dict(re.findall(r"(T\d+)='([^']+)'", h))
    global S
    S = {}
    # the question bank as the page builds it (duels store positions in it)
    i = h.index('const SOLO_QUESTIONS = [') + len('const SOLO_QUESTIONS = '); d = 0; j = i; ins = None
    while True:
        ch = h[j]
        if ins:
            if ch == '\\': j += 2; continue
            if ch == ins: ins = None
        elif ch in "'\"`": ins = ch
        elif ch == '[': d += 1
        elif ch == ']':
            d -= 1
            if d == 0: break
        j += 1
    consts = re.search(r"^const T1=.*$", h, re.M).group(0)
    open('/tmp/sq.js', 'w', encoding='utf-8').write(consts + "\nconst A=" + h[i:j+1] + ";\nconst K=q=>{let h=5381;const t=q.q+(q.img||'');for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))>>>0;return h.toString(36);};console.log(JSON.stringify(A.map(q=>({topic:q.topic,q:q.q,img:q.img||'',a:q.a,c:0,k:K(q)}))));")
    global BANK, CUTOFF
    BANK = json.loads(subprocess.check_output(['node', '/tmp/sq.js']))
    CUTOFF = int(subprocess.check_output(['git', 'log', '-G', r'\{topic:T', '--format=%ct', '-1', '--', 'index.html']).strip() or 0)
    print(f"::notice title=bank::{len(BANK)} questions, duels counted from {CUTOFF}")
    BYKEY = {b['k']: b for b in BANK}
    def tally(q, right, mode):
        if not q or not q.get('q') or q.get('type') == 'poll': return
        k = (q['q'], q.get('img') or '')
        r = S.setdefault(k, {'topic': q.get('topic') or '', 'n': 0, 'ok': 0, 'duel': 0, 'group': 0, 'live': 0, 'answers': q.get('a') or [], 'c': q.get('c')})
        r['n'] += 1; r['ok'] += 1 if right else 0; r[mode] += 1
    duels = groups = 0
    for doc in listdocs('rooms'):
        rid = doc['name'].split('/')[-1]; f = {k: val(v) for k, v in doc.get('fields', {}).items()}
        if f.get('kind') == 'duel' and isinstance(f.get('qs'), list):
            # duels keep only bank positions; trust them only after the bank last changed
            if (f.get('createdAt') or 0) / 1000 < CUTOFF or (f.get('createdAt') or 0) / 1000 >= LIVE: continue
            qs = f['qs']; duels += 1
            for k, v in f.items():
                m = re.fullmatch(r'a[12]_(\d+)', k)
                if m and isinstance(v, dict) and int(m.group(1)) < len(qs):
                    bi = qs[int(m.group(1))]
                    if isinstance(bi, int) and 0 <= bi < len(BANK): tally(BANK[bi], (v.get('p') or 0) > 0, 'duel')
        elif rid.startswith('qstats_') and isinstance(f.get('st'), dict):
            for k, v in f['st'].items():
                q = BYKEY.get(k)
                if not q or not isinstance(v, dict): continue
                n, ok = int(v.get('n') or 0), int(v.get('ok') or 0)
                kk = (q['q'], q.get('img') or '')
                r = S.setdefault(kk, {'topic': q.get('topic') or '', 'n': 0, 'ok': 0, 'duel': 0, 'group': 0, 'live': 0, 'answers': q['a'], 'c': 0})
                r['n'] += n; r['ok'] += ok; r['live'] += n
        elif isinstance(f.get('qset'), list) and f['qset'] and (f.get('phaseAt') or 0) / 1000 < LIVE:
            qs = f['qset']; groups += 1
            for a in listdocs('rooms/' + rid + '/answers'):
                d = {k: val(v) for k, v in a.get('fields', {}).items()}
                i = d.get('qIndex')
                if isinstance(i, int) and 0 <= i < len(qs): tally(qs[i], d.get('choice') == qs[i].get('c'), 'group')
    os.makedirs('out', exist_ok=True)
    rows = sorted(S.items(), key=lambda kv: kv[1]['ok'] / kv[1]['n'])
    with open('out/q_stats.csv', 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['אחוז הצלחה', 'ענו', 'צדקו', 'ראש בראש (ישן)', 'קבוצתי (ישן)', 'מעכשיו', 'נושא', 'שאלה', 'תמונה', 'תשובה נכונה'])
        for (q, img), r in rows:
            t = TOP.get(q, ''); t = NAMES.get(t, '') or r['topic']; c = r['c']; ans = r['answers'][c] if isinstance(c, int) and c < len(r['answers']) else ''
            w.writerow([round(100 * r['ok'] / r['n']), r['n'], r['ok'], r['duel'], r['group'], r['live'], t, q, img.split('/')[-1][:60], ans])
    tot = sum(r['n'] for r in S.values())
    print(f"::notice title=summary::duel games {duels}, group games {groups}, questions {len(S)}, answers {tot}, with 5+ answers {sum(1 for r in S.values() if r['n']>=5)}")
try: main()
except Exception:
    print('::error title=crash::' + traceback.format_exc().replace('\n', ' | ')[-900:]); sys.exit(1)
