# For each "seen" history doc: in the last N rounds, how many distinct car-logo / brand / sign pictures came up
import json, re, sys, urllib.request
h = open('index.html', encoding='utf-8').read()
rx = re.compile(r"\{topic:(T\d+), q:'((?:[^'\\]|\\.)*)'(?:, img:'((?:[^'\\]|\\.)*)')?")
def key(q, img):
    t = q + (img or ''); x = 5381
    for ch in t.encode('utf-16-le').decode('utf-16-le'):
        for cu in ch.encode('utf-16-be').hex() and [int(ch.encode('utf-16-be').hex()[i:i+4], 16) for i in range(0, len(ch.encode('utf-16-be').hex()), 4)]:
            x = ((x << 5) + x + cu) & 0xFFFFFFFF
    n = x; s = ''
    while True:
        n, r = divmod(n, 36); s = '0123456789abcdefghijklmnopqrstuvwxyz'[r] + s
        if n == 0: break
    return s
un = lambda s: (s or '').replace("\\'", "'").replace('\\\\', '\\')
K = {}
for m in rx.finditer(h): K[key(un(m.group(2)), un(m.group(3)) if m.group(3) else '')] = (m.group(1), bool(m.group(3)), un(m.group(2))[:30])
base = 'https://firestore.googleapis.com/v1/projects/budapest-983e4/databases/(default)/documents/rooms'
docs, tok = [], ''
while True:
    d = json.load(urllib.request.urlopen(base + '?pageSize=300' + ('&pageToken=' + tok if tok else '')))
    docs += d.get('documents', []); tok = d.get('nextPageToken')
    if not tok: break
for doc in docs:
    name = doc['name'].split('/')[-1]
    if not name.startswith('seen_'): continue
    keys = [v.get('stringValue') for v in doc.get('fields', {}).get('keys', {}).get('arrayValue', {}).get('values', [])]
    rec = keys[-450:]
    car = [k for k in rec if K.get(k, ('',))[0] == 'T25']
    unknown = sum(1 for k in rec if k not in K)
    print(f"::notice::{name} total={len(keys)} last450: known={len(rec)-unknown} unknown={unknown} cars={len(car)} distinctCars={len(set(car))}")
