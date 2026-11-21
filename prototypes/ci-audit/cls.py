import json,re,fnmatch,collections
d=json.load(open('some-ui.json'))
dirs=json.load(open('dirs.json')).values()
render=[l.strip() for l in open('render-dirs.txt') if l.strip()]
www=[l.strip() for l in open('www-dirs.txt') if l.strip()]
def m(f,pats): return any(fnmatch.fnmatch(f,p) for p in pats)
CIW=['.github/workflows/pr.yml','.github/actions/*','flake.nix','flake.lock','nix/*']
def under(f,ds): return any(f.startswith(x+'/') for x in ds)
def pkgdir(f):
    best=None
    for x in dirs:
        if f.startswith(x+'/') and (best is None or len(x)>len(best)): best=x
    return best
ROOTNODE=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','turbo.json','tsconfig*.json','.nvmrc','scripts/*','knip.json','.prettier*','eslint.config.*','.github/workflows/pr.yml','.github/actions/*','flake.nix','flake.lock','nix/*']
need={
 'Rust CI / Rust (fmt · clippy · test)': lambda f: m(f,['crates/*','Cargo.toml','Cargo.lock','.cargo/*','rust-toolchain*','clippy.toml','rustfmt.toml','scripts/check-wasm-bindgen-boundary.sh','scripts/check-mutation-boundary.sh','.github/workflows/_rust-ci.yml']+CIW),
 'deny-rust': lambda f: m(f,['crates/*','Cargo.toml','Cargo.lock','.cargo/*','deny.toml','.github/workflows/_deny-checks.yml']+CIW),
 'Deny Checks / Node License Audit': lambda f: m(f,['pnpm-lock.yaml','*package.json','pnpm-workspace.yaml','scripts/audit-node-licenses.mjs','.github/workflows/_deny-checks.yml']+CIW),
 'Render image / the stage builds from nothing (RI3)': lambda f: (under(f,render) or (f.startswith('apps/www/') and not f.startswith('apps/www/tests/')) or m(f,['infra/render/*','pnpm-lock.yaml','package.json','pnpm-workspace.yaml','turbo.json','tsconfig*.json','.github/workflows/pr.yml'])) and not f.endswith('.md'),
 'node': lambda f: (pkgdir(f) is not None and not f.startswith(('extensions/','crates/'))) or m(f,ROOTNODE),
 'Build www (TanStack app)': lambda f: under(f,www+['apps/www']) or m(f,['pnpm-lock.yaml','package.json','pnpm-workspace.yaml','turbo.json','tsconfig*.json','scripts/release/*','.github/workflows/pages.yml','.github/actions/*','flake.nix','flake.lock']),
}
def key(j):
    n=j['name']
    if n.startswith('Deny Checks / Rust'): return 'deny-rust'
    if n.startswith('Node CI / ') and n!='Node CI / e2e': return 'node'
    return n
def classify(files):
    s=set()
    for f in files:
        if f.startswith(('docs/calls/',)) : s.add('calls')
        elif f=='packages/assurance/src/ledger.json': s.add('ledger')
        elif f.endswith('.md') or f.startswith('docs/'): s.add('docs')
        elif f.startswith('.github/'): s.add('workflows')
        elif f.startswith('crates/') or f.startswith('Cargo'): s.add('rust')
        else:
            p=pkgdir(f); s.add('pkg:'+(p or 'root'))
    pk=[x for x in s if x.startswith('pkg:')]
    if not pk and 'rust' not in s and 'workflows' not in s: return 'docs/calls/ledger-only'
    if 'workflows' in s: return 'workflows'
    if 'rust' in s and not pk: return 'rust-only'
    if len(pk)==1 and 'rust' not in s: return 'single TS package'
    return 'mixed'
waste=collections.Counter();spent=collections.Counter();runsn=collections.Counter();idle=collections.Counter();totalrun=collections.Counter()
cat=collections.Counter();mergemin=0;mergeruns=0;tot=0
for p in d:
    F=p['files']; c=classify(F); cat[c]+=1
    for r in p['runs']:
        if r['merge']: mergeruns+=1; mergemin+=sum(j['min'] for j in r['jobs'] if j['steps'])
        for j in r['jobs']:
            if not j['steps']: continue
            k=key(j); tot+=j['min']
            spent[k]+=j['min']; runsn[k]+=1
            if k=='Node CI / e2e':
                real=any(s[2]>45 for s in j['steps'] if s[0].startswith('E2E'))
                if not real: waste[k]+=j['min']; idle[k]+=1
            elif k in need:
                if not any(need[k](f) for f in F): waste[k]+=j['min']; idle[k]+=1
    p['cat']=c
print(cat)
for k in spent: print(f"{k[:55]:55s} runs={runsn[k]:3d} min={spent[k]:6.1f} avg={spent[k]/runsn[k]:4.1f} idle_runs={idle[k]:3d} ({100*idle[k]/runsn[k]:.0f}%) waste={waste[k]:6.1f}")
print('total',round(tot),'waste',round(sum(waste.values())),'merge-runs',mergeruns,'merge-run-min',round(mergemin))
# per PR share couldn't fail
pp=collections.Counter()
for k in need:
    pp[k]=sum(1 for p in d if not any(need[k](f) for f in p['files']))
print('PRs (of %d) where job could not fail:'%len(d),dict(pp))
for p in d: print(p['n'],p['cat'])
