# Read-only: how often each question was answered right, from every duel and group game saved in Firestore.
# (Solo rounds don't save per-question answers, so they aren't in here.)  Output: out/q_stats.csv
import json, re, csv, os, urllib.request, urllib.parse
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
def main():
    # topic of each bank question, by its text
    h = open('index.html', encoding='utf-8').read()
    TOP = {}
    for m in re.finditer(r"\{topic:(T\d+), q:'((?:[^'\\]|\\.)*)'", h): TOP.setdefault(m.group(2).replace("\\'", "'"), m.group(1))
    NAMES = dict(re.findall(r"(T\d+)='([^']+)'", h))
    global S
    S = {}
    def tally(q, right, mode):
        if not q or not q.get('q') or q.get('type') == 'poll': return
        k = (q['q'], q.get('img') or '')
        r = S.setdefault(k, {'topic': q.get('topic') or '', 'n': 0, 'ok': 0, 'duel': 0, 'group': 0, 'answers': q.get('a') or [], 'c': q.get('c')})
        r['n'] += 1; r['ok'] += 1 if right else 0; r[mode] += 1
    duels = groups = 0
    for doc in listdocs('rooms'):
        rid = doc['name'].split('/')[-1]; f = {k: val(v) for k, v in doc.get('fields', {}).items()}
        if f.get('kind') == 'duel' and isinstance(f.get('qs'), list):
            qs = f['qs']; duels += 1
            for k, v in f.items():
                m = re.fullmatch(r'a[12]_(\d+)', k)
                if m and isinstance(v, dict) and int(m.group(1)) < len(qs):
                    q = qs[int(m.group(1))]; tally(q, v.get('c') == q.get('c'), 'duel')
        elif isinstance(f.get('qset'), list) and f['qset']:
            qs = f['qset']; groups += 1
            for a in listdocs('rooms/' + rid + '/answers'):
                d = {k: val(v) for k, v in a.get('fields', {}).items()}
                i = d.get('qIndex')
                if isinstance(i, int) and 0 <= i < len(qs): tally(qs[i], d.get('choice') == qs[i].get('c'), 'group')
    os.makedirs('out', exist_ok=True)
    rows = sorted(S.items(), key=lambda kv: kv[1]['ok'] / kv[1]['n'])
    with open('out/q_stats.csv', 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['אחוז הצלחה', 'ענו', 'צדקו', 'ראש בראש', 'קבוצתי', 'נושא', 'שאלה', 'תמונה', 'תשובה נכונה'])
        for (q, img), r in rows:
            t = TOP.get(q, ''); t = NAMES.get(t, '') or r['topic']; c = r['c']; ans = r['answers'][c] if isinstance(c, int) and c < len(r['answers']) else ''
            w.writerow([round(100 * r['ok'] / r['n']), r['n'], r['ok'], r['duel'], r['group'], t, q, img.split('/')[-1][:60], ans])
    tot = sum(r['n'] for r in S.values())
    print(f"::notice title=summary::duel games {duels}, group games {groups}, questions {len(S)}, answers {tot}, with 5+ answers {sum(1 for r in S.values() if r['n']>=5)}")
try: main()
except Exception:
    print('::error title=crash::' + traceback.format_exc().replace('\n', ' | ')[-900:]); sys.exit(1)
