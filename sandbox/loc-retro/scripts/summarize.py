#!/usr/bin/env python3
"""Print the numbers a round report cites, from one round's JSON (stdlib only).

  summarize.py ROUND_DIR [--trim PR,PR,...] [--feature PR,PR,...]

ROUND_DIR holds prs.json, prs_t2.json, recon.json, recon_t2.json, deaths.json
and optionally score_*.json, as written by retro.py. The --trim and --feature
lists are the round's hand classification of PRs (stated in its report).
"""
import argparse, collections, glob, json, os

ap = argparse.ArgumentParser()
ap.add_argument("round_dir")
ap.add_argument("--trim", default="")
ap.add_argument("--feature", default="")
a = ap.parse_args()
R = a.round_dir
TRIM = {int(x) for x in a.trim.split(",") if x}
FEAT = {int(x) for x in a.feature.split(",") if x}
load = lambda n: json.load(open(os.path.join(R, n)))
pct = lambda x, y: f"{100 * x / max(y, 1):.1f}%"

# ---- per PR ----
t1 = {r["pr"]: r for r in load("prs.json")["prs"]}
t2 = {r["pr"]: r for r in load("prs_t2.json")["prs"]}
print("## Per PR")
print(f"{'PR':>6} {'kind':5} {'src+':>6} {'src-':>6} {'tst+':>6} {'tst-':>6} {'cmt+':>5} {'T1%':>5} {'T2%':>5} {'tT2%':>5} {'cases':>5} {'each':>4} {'prop':>4}  subject")
for pr, r in t1.items():
    b, x = r["by_cat"], t2[pr]
    kind = "bot" if r["bot"] else ("agent" if r["agent"] else "human")
    print(f"{pr:>6} {kind:5} {b['source']['add']:6} {b['source']['del']:6} {b['test']['add']:6} {b['test']['del']:6} "
          f"{r['comment_added']:5} {100 * r['cloned_added'] / max(r['added_sig'], 1):5.1f} "
          f"{100 * x['cloned_added'] / max(r['added_sig'], 1):5.1f} {100 * x['cloned_added_test'] / max(r['added_sig_test'], 1):5.1f} "
          f"{r['test']['cases']:5} {r['test']['each']:4} {r['test']['property']:4}  {r['subject'][:58]}")

# ---- feature PRs ----
if FEAT:
    S = collections.Counter()
    for pr in FEAT:
        r, x, b = t1[pr], t2[pr], t1[pr]["by_cat"]
        S.update(src=b["source"]["add"], test=b["test"]["add"], stories=b["stories"]["add"], cmt=r["comment_added"],
                 prov=x.get("provenance_added", 0), sig=r["added_sig"], t1=r["cloned_added"], t2=x["cloned_added"],
                 tsig=r["added_sig_test"], tt1=r["cloned_added_test"], tt2=x["cloned_added_test"],
                 cases=r["test"]["cases"], each=r["test"]["each"], prop=r["test"]["property"], mock=r["test"]["mock"])
    code = S["src"] + S["test"] + S["stories"]
    print(f"\n## Feature PRs ({len(FEAT)})")
    print(f"lines added: source {S['src']}, test {S['test']}, stories {S['stories']}; test/source {S['test'] / S['src']:.2f}")
    print(f"comment lines: {S['cmt']} ({pct(S['cmt'], code)} of code added); provenance-marked {S['prov']} ({pct(S['prov'], S['cmt'])} of comments)")
    print(f"source clones: exact {pct(S['t1'], S['sig'])}, literal-normalized {pct(S['t2'], S['sig'])}")
    print(f"test clones:   exact {pct(S['tt1'], S['tsig'])}, literal-normalized {pct(S['tt2'], S['tsig'])}")
    print(f"test cases {S['cases']}: table-driven {S['each']} ({pct(S['each'], S['cases'])}), property {S['prop']}, mocks {S['mock']}")

# ---- deaths: trims vs retirements ----
B = [(7, "<7d"), (30, "7-30d"), (90, "30-90d"), (1e9, ">90d")]
bucket = lambda d: next(n for lim, n in B if d < lim)
print("\n## Lines deleted by cleanup PRs, traced to origin")
for label, sel in (("TRIM", lambda p: p["pr"] in TRIM), ("RETIRE", lambda p: p["pr"] not in TRIM)):
    c, ages, ag = collections.Counter(), collections.defaultdict(list), collections.Counter()
    for p in load("deaths.json"):
        if not sel(p):
            continue
        for o in p["origins"]:
            for k, v in o["lines"].items():
                cat = k.split("/")[0]
                c[k] += v
                ages[cat] += [o["age_days"]] * v
                ag[(cat, bool(o["agent"]))] += v
    T = sum(c.values())
    print(f"\n{label}: {T} lines")
    for k, v in c.most_common(8):
        print(f"   {k:20}{v:7} {pct(v, T):>6}")
    for cat, xs in sorted(ages.items()):
        if len(xs) > 500:
            xs.sort()
            byb = collections.Counter(bucket(d) for d in xs)
            print(f"   {cat:9} median age {xs[len(xs) // 2]:4.0f}d  p25 {xs[len(xs) // 4]:4.0f}d  "
                  + "  ".join(f"{n} {pct(byb[n], len(xs))}" for _, n in B)
                  + f"  agent-authored {pct(ag[(cat, True)], ag[(cat, True)] + ag[(cat, False)])}")

# ---- recon ----
a1, a2 = load("recon.json")["workspaces"], load("recon_t2.json")["workspaces"]
tot = collections.Counter()
for n in a1:
    w, x = a1[n], a2[n]
    tot.update(sig=w["sig"], c1=w["cloned"], c2=x["cloned"], tsig=w["test_sig"], t1=w["test_cloned"], t2=x["test_cloned"],
               src=w["src_lines"], test=w["test_lines"], cases=w["test_cases"], each=w["each"], prop=w["property"], mock=w["mock"])
print("\n## Repo at head")
print(f"source {tot['src']} lines, tests {tot['test']} (test/source {tot['test'] / tot['src']:.2f})")
print(f"source clones exact {pct(tot['c1'], tot['sig'])}, literal-normalized {pct(tot['c2'], tot['sig'])}; "
      f"test clones exact {pct(tot['t1'], tot['tsig'])}, literal-normalized {pct(tot['t2'], tot['tsig'])}")
print(f"test cases {tot['cases']}: table-driven {pct(tot['each'], tot['cases'])}, property {pct(tot['prop'], tot['cases'])}, mocks {tot['mock']}")
print(f"{'workspace':32}{'src':>7}{'test':>7}{'t/s':>6}{'srcT2':>7}{'tstT2':>7}{'zip':>6}{'prop':>5}")
for n in sorted(a1, key=lambda n: -a1[n]["src_lines"]):
    w, x = a1[n], a2[n]
    if w["src_lines"] + w["test_lines"] < 1500:
        continue
    print(f"{n:32}{w['src_lines']:7}{w['test_lines']:7}{w['test_lines'] / max(w['src_lines'], 1):6.2f}"
          f"{pct(x['cloned'], w['sig']):>7}{pct(x['test_cloned'], w['test_sig']):>7}{w['compression'] or 0:6.3f}{w['property']:5}")

# ---- scores ----
for f in sorted(glob.glob(os.path.join(R, "score_*.json"))):
    s = json.load(open(f))
    base = s["total"]["added"]["death_rate"] or 1e-9
    print(f"\n## {os.path.basename(f)}: flags from {s['flags_head'][:8]} scored at {s['head'][:8]}")
    for cls, v in s["total"].items():
        print(f"   {cls:8} n={v['n']:6} dead={v['dead']:5} rate={100 * v['death_rate']:.1f}%  lift {v['death_rate'] / base:.2f}x")
