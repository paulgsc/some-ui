import json,subprocess,sys,datetime as dt
from concurrent.futures import ThreadPoolExecutor
repo=sys.argv[1]; N=int(sys.argv[2])
def gh(path,paginate=False):
    cmd=['gh','api',path]+(['--paginate'] if paginate else [])
    for _ in range(3):
        r=subprocess.run(cmd,capture_output=True,text=True)
        if r.returncode==0: break
    out=r.stdout
    if paginate and out.strip().startswith('['):
        out=out.replace('][',',').replace(']\n[',',')
    return json.loads(out) if out.strip() else None
def ts(s): return dt.datetime.fromisoformat(s.replace('Z','+00:00')) if s else None
prs=[]
page=1
while len(prs)<N:
    batch=gh(f'repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50&page={page}')
    if not batch: break
    prs+= [p for p in batch if p['merged_at']]
    page+=1
prs=sorted(prs,key=lambda p:p['merged_at'],reverse=True)[:N]
def one(p):
    n=p['number']
    files=[f['filename'] for f in gh(f'repos/{repo}/pulls/{n}/files?per_page=100',True)]
    commits=gh(f'repos/{repo}/pulls/{n}/commits?per_page=100',True)
    merges={c['sha'] for c in commits if len(c['parents'])>1 and c['commit']['message'].startswith('Merge')}
    runs=gh(f"repos/{repo}/actions/runs?branch={p['head']['ref']}&per_page=100")['workflow_runs']
    c0,c1=ts(p['created_at'])-dt.timedelta(minutes=5),ts(p['merged_at'])+dt.timedelta(minutes=1)
    runs=[r for r in runs if r['event'] in('pull_request','pull_request_target') and c0<=ts(r['created_at'])<=c1]
    out=[]
    for r in runs:
        jobs=gh(f"repos/{repo}/actions/runs/{r['id']}/jobs?per_page=100&filter=all",True)
        jl=jobs['jobs'] if isinstance(jobs,dict) else [j for x in jobs for j in x['jobs']]
        js=[]
        for j in jl:
            if j['started_at'] and j['completed_at'] and j['conclusion'] not in ('skipped',None):
                m=(ts(j['completed_at'])-ts(j['started_at'])).total_seconds()/60
                steps=[(s['name'],s['conclusion'],((ts(s['completed_at'])-ts(s['started_at'])).total_seconds() if s.get('completed_at') and s.get('started_at') else 0)) for s in j.get('steps',[])]
                js.append({'name':j['name'],'min':round(max(m,0),2),'concl':j['conclusion'],'steps':steps,'id':j['id']})
        out.append({'id':r['id'],'wf':r['name'],'sha':r['head_sha'],'merge':r['head_sha'] in merges,'created':r['created_at'],'concl':r['conclusion'],'jobs':js})
    return {'n':n,'title':p['title'],'merged':p['merged_at'],'files':files,'runs':out,'head':p['head']['sha']}
with ThreadPoolExecutor(8) as ex: res=list(ex.map(one,prs))
json.dump(res,open(f"{repo.split('/')[1]}.json",'w'))
print(len(res))
