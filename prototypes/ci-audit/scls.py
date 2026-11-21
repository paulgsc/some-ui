import json,fnmatch,collections
d=json.load(open('server.json'))
def m(f,p): return any(fnmatch.fnmatch(f,x) for x in p)
RS=['*.rs','Cargo.toml','Cargo.lock','*/Cargo.toml','apps/*','crates/*','migrations/*','.sqlx/*','*/.sqlx/*','fixtures/*','.cargo/*','rust-toolchain*','clippy.toml','*rustfmt.toml']
need={
 'deny': lambda f: m(f,['Cargo.toml','Cargo.lock','*/Cargo.toml','deny.toml','.github/workflows/deny.yml']),
 'metric_contract_ci': lambda f: m(f,['*.rs','infra/grafana/*','infra/prometheus/*','infra/render/*','scripts/check_metric_contract.py','.github/workflows/test.yml']),
 'rust_ci': lambda f: m(f,RS+['.github/workflows/test.yml','infra/docker/Dockerfile.*']) and not f.endswith('.md'),
 'Rust lint': lambda f: m(f,RS+['scripts/check_clippy_baseline.py','scripts/clippy_baseline.json','scripts/check_instrument_skip.py','scripts/check_privacy.py','.github/workflows/lint.yml']) and not f.endswith('.md'),
}
def key(n):
    if n.startswith('Rust Deny Checks') or n=='Deny Checks Summary': return 'deny'
    return n
cat=collections.Counter();spent=collections.Counter();idle=collections.Counter();n=collections.Counter();waste=collections.Counter();tot=0;mm=0;mr=0
for p in d:
    F=p['files']
    k='docs-only' if all(f.endswith('.md') or f.startswith('docs/') for f in F) else 'release/deploy-only' if all(f.startswith('deploy/') or f.startswith('.github/docker-changesets') for f in F) else 'rust-only' if all(m(f,RS) or f.endswith('.md') for f in F) else 'workflows' if any(f.startswith('.github/workflows') for f in F) else 'mixed'
    cat[k]+=1
    for r in p['runs']:
        if r['merge']: mr+=1; mm+=sum(j['min'] for j in r['jobs'] if j['steps'])
        for j in r['jobs']:
            if not j['steps']: continue
            kk=key(j['name']); spent[kk]+=j['min']; n[kk]+=1; tot+=j['min']
            if kk in need and not any(need[kk](f) for f in F): idle[kk]+=1; waste[kk]+=j['min']
print(cat)
for kk in sorted(spent,key=lambda x:-spent[x])[:16]: print(f"{kk[:45]:45s} runs={n[kk]:3d} min={spent[kk]:6.1f} avg={spent[kk]/n[kk]:4.1f} idle={idle[kk]} ({100*idle[kk]/n[kk]:.0f}%) waste={waste[kk]:.1f}")
print('total',round(tot),'waste',round(sum(waste.values())),'merge runs',mr,round(mm))
print({kk:sum(1 for p in d if not any(need[kk](f) for f in p['files'])) for kk in need})
