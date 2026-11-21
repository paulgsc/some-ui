import json,sys,collections
d=json.load(open(sys.argv[1]))
tot=collections.Counter();cnt=collections.Counter()
for p in d:
    runs=p['runs']; m=sum(j['min'] for r in runs for j in r['jobs'])
    print(p['n'],p['merged'][:10],len(p['files']),'runs',len(runs),'merge-runs',sum(r['merge'] for r in runs),'min',round(m),'|',p['title'][:60])
    print('    ',sorted(set('/'.join(f.split('/')[:2]) for f in p['files']))[:8])
    for r in runs:
        for j in r['jobs']: tot[r['wf']+' :: '+j['name']]+=j['min']; cnt[r['wf']+' :: '+j['name']]+=1
print()
for k,v in tot.most_common(60): print(f"{v:7.1f} {cnt[k]:3d} {v/cnt[k]:5.1f}  {k}")
print('TOTAL',round(sum(tot.values())))
