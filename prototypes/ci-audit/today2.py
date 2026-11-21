import json,subprocess,sys,datetime as dt,collections
from concurrent.futures import ThreadPoolExecutor
repo=sys.argv[1]
def gh(p): return json.loads(subprocess.run(['gh','api',p],capture_output=True,text=True).stdout)
runs=[]
for h in range(0,24,2):
  rng=f'2026-11-21T{h:02d}:00:00Z..2026-11-21T{h+1:02d}:59:59Z'
  for page in range(1,11):
    b=gh(f'repos/{repo}/actions/runs?created={rng}&per_page=100&page={page}')['workflow_runs']
    if not b: break
    runs+=b
ts=lambda s: dt.datetime.fromisoformat(s.replace('Z','+00:00'))
pr=[r for r in runs if r['event']=='pull_request' or (r['event']=='dynamic' and r['name'].startswith('PR #'))]
def mins(r):
    js=gh(f"repos/{repo}/actions/runs/{r['id']}/jobs?per_page=100&filter=all")['jobs']
    return sum((ts(j['completed_at'])-ts(j['started_at'])).total_seconds()/60 for j in js if j['started_at'] and j['completed_at'] and j['conclusion']!='skipped')
with ThreadPoolExecutor(10) as ex: ms=list(ex.map(mins,pr))
c=collections.Counter();cm=collections.Counter();shas=set();mshas=set()
for r,m in zip(pr,ms):
    msg=(r.get('head_commit') or {}).get('message','')
    ism=msg.startswith("Merge branch 'main'") or msg.startswith('Merge remote-tracking branch') or msg.startswith("Merge branch 'main' into")
    k=('merge' if ism else 'content')
    c[k]+=1; cm[k]+=m; (mshas if ism else shas).add(r['head_sha'])
    cm['wf:'+('CodeQL' if r['event']=='dynamic' else r['name'])+':'+k]+=m
json.dump([[r['id'],r['name'],r['event'],r['head_sha'],(r.get('head_commit') or {}).get('message','')[:80],m] for r,m in zip(pr,ms)],open(repo.split('/')[1]+'-today.json','w'));print(repo,'all runs today',len(runs),'PR-triggered',len(pr))
print({k:round(v) for k,v in cm.items()}, dict(c), 'merge heads',len(mshas),'content heads',len(shas))
