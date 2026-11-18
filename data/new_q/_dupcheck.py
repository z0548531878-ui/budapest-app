# usage: python3 _dupcheck.py yourfile.json   -> lists your questions that look like existing ones (bank + other new files)
import json,re,sys,glob,os
D=os.path.dirname(os.path.abspath(__file__))
B=[(b['q'],b['a'][0],'bank') for b in json.load(open(D+'/_bank.json'))]
me=os.path.abspath(sys.argv[1])
for f in glob.glob(D+'/*.json'):
    if f.endswith('_bank.json') or os.path.abspath(f)==me: continue
    try: B+= [(x['q'],x['a'][0],os.path.basename(f)) for x in json.load(open(f))]
    except Exception: pass
W=lambda s:set(re.findall(r"[֐-׿a-zA-Z0-9']{2,}",s))
BW=[(W(q),a,q,src) for q,a,src in B]
N=json.load(open(me)); bad=0
for i,x in enumerate(N):
    qw=W(x['q']); best=(0,None)
    for bw,a,q,src in BW:
        s=len(qw&bw)/max(1,len(qw)) + (0.6 if a==x['a'][0] and len(a)>2 else 0)
        if s>best[0]: best=(s,(q,a,src))
    if best[0]>=0.75:
        bad+=1; print(f"#{i} {round(best[0],2)} | {x['q'][:70]} || {best[1][0][:70]} | {best[1][1]} [{best[1][2]}]")
    if len(x['a'])!=4 or len(set(x['a']))!=4: print(f"#{i} needs exactly 4 different answers")
print(len(N),'questions,',bad,'possible duplicates (score>=0.75; review each, 0.75-1.0 may be a false alarm)')
