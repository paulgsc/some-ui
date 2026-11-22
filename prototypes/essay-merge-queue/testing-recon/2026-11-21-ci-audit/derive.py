"""Derives jobs.json (some-ui) and today.json from the raw API pulls (some-ui.json, *-today.json).

jobs.json: the last 30 merged some-ui PRs, each run's jobs with their runner-minutes and
whether the PR's files could fail the job, by cls.py's rules. today.json: every PR-triggered
run on 2026-11-21 in both repos, and whether its head was an update-branch merge of main.
"""
import io, json, runpy, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    g = runpy.run_path("cls.py")
need, key, d = g["need"], g["key"], g["d"]
out = []
for p in d:
    runs = []
    for r in p["runs"]:
        jobs = []
        for j in r["jobs"]:
            if not j["steps"]:
                continue
            k = key(j)
            if k == "Node CI / e2e":
                could = any(s[2] > 45 for s in j["steps"] if s[0].startswith("E2E"))
            elif k in need:
                could = any(need[k](f) for f in p["files"])
            else:
                could = True
            jobs.append({"name": j["name"], "min": j["min"], "couldFail": could})
        runs.append({"id": r["id"], "workflow": r["wf"], "sha": r["sha"], "updateBranch": r["merge"], "jobs": jobs})
    out.append({"pr": p["n"], "title": p["title"], "merged": p["merged"], "files": p["files"], "runs": runs})
json.dump({"repo": "paulgsc/some-ui", "prs": out}, open("jobs.json", "w"), separators=(",", ":"))
def ism(m): return m.startswith("Merge branch 'main'") or m.startswith("Merge remote-tracking branch")
today = {}
for repo in ["some-ui", "server"]:
    rows = json.load(open(f"{repo}-today.json"))
    today[f"paulgsc/{repo}"] = [{"run": r[0], "workflow": r[1], "event": r[2], "sha": r[3], "updateBranch": ism(r[4]), "min": round(r[5], 2)} for r in rows]
json.dump({"day": "2026-11-21", "runs": today}, open("today.json", "w"), separators=(",", ":"))
