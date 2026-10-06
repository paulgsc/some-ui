#!/usr/bin/env python3
"""Retrospective LOC measurements over merged PRs (sandbox tooling, stdlib only).

  retro.py prs      --head REF --k N            per-PR lines by category, clones, test shape, survival
  retro.py deaths   --head REF --k N            blame lines deleted by cleanup PRs back to their birth PR
  retro.py recon    --head REF                  per-workspace signals on the tree at REF

All output is JSON on stdout. Run from the repo root.
"""
import argparse, collections, hashlib, json, re, subprocess, sys, zlib
from datetime import datetime, timezone

def git(*a, check=True):
    return subprocess.run(["git", *a], capture_output=True, text=True, errors="replace", check=check).stdout

PR_RE = re.compile(r"\(#(\d+)\)$")
BOT_RE = re.compile(r"^chore\((deps|deps-dev|release)\)")

def category(p):
    if re.search(r"(^|/)(pnpm-lock\.yaml|Cargo\.lock|routes\.server\.json|CHANGELOG\.md)$|/generated/|\.gen\.|\.snap$|routeTree", p):
        return "generated"
    if re.search(r"\.stories\.", p):
        return "stories"
    if re.search(r"\.(test|spec)\.|(^|/)(__tests__|tests?|e2e)/", p):
        return "test"
    if re.search(r"\.(md|mdx)$", p):
        return "docs"
    if re.search(r"\.(ts|tsx|js|jsx|mjs|cjs|rs|css|py|sh)$", p):
        return "source"
    if re.search(r"\.(json|ya?ml|toml)$|(^|/)\.[^/]+rc|config\.", p):
        return "config"
    return "other"

CODE = {"source", "test", "stories"}

def workspace(p):
    parts = p.split("/")
    if parts[0] in ("apps", "extensions", "crates") and len(parts) > 2:
        return "/".join(parts[:2])
    if parts[0] == "packages" and len(parts) > 2:
        return "/".join(parts[:3]) if parts[1] == "ui" and len(parts) > 3 else "/".join(parts[:2])
    if parts[0] == "docs" and len(parts) > 2:
        return "/".join(parts[:2])
    return "(root)"

def merged_prs(head, k):
    out = []
    for line in git("log", "--first-parent", "--format=%H%x1f%ct%x1f%s%x1f%b%x1e", head).split("\x1e"):
        line = line.strip("\n")
        if not line:
            continue
        sha, ct, subj, body = line.split("\x1f")
        m = PR_RE.search(subj)
        if not m:
            continue
        out.append({"sha": sha, "pr": int(m.group(1)), "ts": int(ct), "subject": subj,
                    "bot": bool(BOT_RE.match(subj)),
                    "agent": bool(re.search(r"claude\.ai/code|Co-Authored-By: Claude", body))})
        if len(out) >= k:
            break
    return out

def pr_index(head):
    """sha -> pr number for every squash commit on first-parent history."""
    idx = {}
    for line in git("log", "--first-parent", "--format=%H%x1f%s", head).splitlines():
        sha, subj = line.split("\x1f", 1)
        m = PR_RE.search(subj)
        idx[sha] = int(m.group(1)) if m else None
    return idx

# ---------- significant lines and clone windows ----------
W = 6
TRIVIAL = re.compile(r"^[\W_]*$")
SKIP = re.compile(r"^(import\b|export \{|export \* from|//|/\*|\*|#(?!\[)|use )")
COMMENT = re.compile(r"^\s*(//|/\*|\*|#(?!\[|!))")

LIT = re.compile(r"`[^`]*`|'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|\b\d+(\.\d+)?\b")
LITERALS = False  # set by --literals: Type-2 clones, literals replaced by a placeholder

def significant(text):
    """[(lineno, normalized)] of lines that carry content."""
    out = []
    for i, raw in enumerate(text.split("\n"), 1):
        s = " ".join(raw.split())
        if LITERALS:
            s = LIT.sub("$L", s)
        if len(s) < 3 or TRIVIAL.match(s) or SKIP.match(s):
            continue
        out.append((i, s))
    return out

def windows(sig):
    for j in range(len(sig) - W + 1):
        h = hashlib.blake2b("\n".join(s for _, s in sig[j:j + W]).encode(), digest_size=8).digest()
        yield h, j

def tree_files(ref, cats=CODE):
    names = [p for p in git("ls-tree", "-r", "--name-only", ref).splitlines() if category(p) in cats]
    proc = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    data = "".join(f"{ref}:{p}\n" for p in names).encode()
    out, _ = proc.communicate(data)
    files, pos = {}, 0
    for p in names:
        nl = out.index(b"\n", pos)
        hdr = out[pos:nl].split()
        if hdr[-1] == b"missing":
            pos = nl + 1
            continue
        size = int(hdr[2])
        blob = out[nl + 1: nl + 1 + size]
        pos = nl + 1 + size + 1
        if b"\0" in blob[:8000]:
            continue
        files[p] = blob.decode("utf-8", "replace")
    return files

def clone_index(files):
    """window hash -> number of (path, position) occurrences; plus per-file sig/windows."""
    count = collections.Counter()
    per = {}
    for p, text in files.items():
        sig = significant(text)
        ws = list(windows(sig))
        per[p] = (sig, ws)
        for h, _ in ws:
            count[h] += 1
    return count, per

def cloned_lines(sig, ws, count):
    """set of line numbers covered by a window that occurs >= 2 times in the tree."""
    hit = set()
    for h, j in ws:
        if count[h] >= 2:
            hit.update(n for n, _ in sig[j:j + W])
    return hit

# ---------- diffs ----------
HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")

def parse_diff(sha):
    """{new_path: {"old": old_path, "added": {lineno: text}, "deleted": {old_lineno: text}}}"""
    files, cur = {}, None
    old_ln = new_ln = 0
    for line in git("show", "-U0", "-M", "--format=", "--no-color", sha).split("\n"):
        if line.startswith("diff --git"):
            cur = {"old": None, "new": None, "added": {}, "deleted": {}}
        elif cur is not None and line.startswith("--- "):
            cur["old"] = None if line[4:] == "/dev/null" else line[6:]
        elif cur is not None and line.startswith("+++ "):
            cur["new"] = None if line[4:] == "/dev/null" else line[6:]
            files[cur["new"] or ("\0del:" + (cur["old"] or ""))] = cur
        elif cur is not None and line.startswith("@@"):
            m = HUNK.match(line)
            old_ln, new_ln = int(m.group(1)), int(m.group(3))
        elif cur is not None and line.startswith("+") and not line.startswith("+++"):
            cur["added"][new_ln] = line[1:]
            new_ln += 1
        elif cur is not None and line.startswith("-") and not line.startswith("---"):
            cur["deleted"][old_ln] = line[1:]
            old_ln += 1
    return files

TEST_CASE = re.compile(r"\b(it|test)(\.(only|skip|todo|concurrent))?\s*\(|#\[(tokio::)?test\]")
TEST_EACH = re.compile(r"\b(it|test|describe)\.each\b|#\[rstest\]|#\[case")
PROPERTY = re.compile(r"\bfc\.(assert|property|asyncProperty)\b|\b(it|test)\.prop\b|proptest!|quickcheck")
PROVENANCE = re.compile(r"#\d{3,}|\b(previously|used to|no longer|review(ed)? round|round \d|was (found|added|introduced)|before this|regression from|originally)\b", re.I)
MOCK = re.compile(r"\bvi\.(mock|fn|spyOn)\b|\bjest\.(mock|fn)\b")

# ---------- survival ----------
def blame_counts(ref, paths):
    """origin sha -> surviving line count, over paths at ref."""
    c = collections.Counter()
    for p in paths:
        out = git("blame", "--line-porcelain", "-w", "-M", ref, "--", p, check=False)
        for line in out.split("\n"):
            if len(line) > 40 and re.match(r"^[0-9a-f]{40} \d+ \d+", line):
                c[line[:40]] += 1
    return c

def cmd_prs(a):
    prs = merged_prs(a.head, a.k)
    head_files = set(git("ls-tree", "-r", "--name-only", a.head).splitlines())
    touched = set()
    rows, flags = [], {}
    for pr in prs:
        diff = parse_diff(pr["sha"])
        row = dict(pr, by_cat={}, test={"cases": 0, "each": 0, "property": 0, "mock": 0},
                   added_sig=0, cloned_added=0, cloned_added_test=0, added_sig_test=0,
                   comment_added=0, files_added=0)
        for c in ("source", "test", "stories", "generated", "docs", "config", "other"):
            row["by_cat"][c] = {"add": 0, "del": 0}
        files = tree_files(pr["sha"])
        count, per = clone_index(files)
        for key, f in diff.items():
            path = f["new"] or f["old"]
            c = category(path)
            row["by_cat"][c]["add"] += len(f["added"])
            row["by_cat"][c]["del"] += len(f["deleted"])
            if f["old"] is None and f["new"]:
                row["files_added"] += 1
            if f["new"]:
                touched.add(f["new"])
            if c in CODE and f["new"]:
                fl = flags.setdefault(pr["pr"], {"sha": pr["sha"], "added": {}, "comment": {}, "clone": {}})
                fl["added"][f["new"]] = sorted(n for n, t in f["added"].items() if t.strip())
                fl["comment"][f["new"]] = sorted(n for n, t in f["added"].items() if COMMENT.match(t))
            if c in CODE:
                added_txt = "\n".join(f["added"].values())
                row["comment_added"] += sum(1 for t in f["added"].values() if COMMENT.match(t))
                row["provenance_added"] = row.get("provenance_added", 0) + sum(
                    1 for t in f["added"].values() if COMMENT.match(t) and PROVENANCE.search(t))
                if c == "test":
                    row["test"]["cases"] += len(TEST_CASE.findall(added_txt))
                    row["test"]["each"] += len(TEST_EACH.findall(added_txt))
                    row["test"]["property"] += len(PROPERTY.findall(added_txt))
                    row["test"]["mock"] += len(MOCK.findall(added_txt))
                if f["new"] in per:
                    sig, ws = per[f["new"]]
                    sig_added = {n for n, _ in sig if n in f["added"]}
                    hit = cloned_lines(sig, ws, count) & sig_added
                    flags[pr["pr"]]["clone"][f["new"]] = sorted(hit)
                    if c == "test":
                        row["added_sig_test"] += len(sig_added)
                        row["cloned_added_test"] += len(hit)
                    else:
                        row["added_sig"] += len(sig_added)
                        row["cloned_added"] += len(hit)
        rows.append(row)
        print(f"#{pr['pr']} done", file=sys.stderr)
    alive = blame_counts(a.head, sorted(p for p in touched if p in head_files))
    for row in rows:
        row["surviving_lines"] = alive.get(row["sha"], 0)
    if a.flags:
        with open(a.flags, "w") as fh:
            json.dump({"head": git("rev-parse", a.head).strip(), "literals": LITERALS, "prs": flags}, fh)
    json.dump({"head": git("rev-parse", a.head).strip(), "k": a.k, "prs": rows}, sys.stdout, indent=1)

def alive_lines(ref):
    """{(origin sha, origin path, origin line)} for every code line at ref."""
    alive = set()
    for p in git("ls-tree", "-r", "--name-only", ref).splitlines():
        if category(p) not in CODE:
            continue
        cur = None
        for line in git("blame", "--line-porcelain", "-w", "-M", ref, "--", p, check=False).split("\n"):
            m = re.match(r"^([0-9a-f]{40}) (\d+) \d+", line)
            if m:
                cur = (m.group(1), int(m.group(2)))
            elif line.startswith("filename ") and cur:
                alive.add((cur[0], line[9:], cur[1]))
                cur = None
    return alive

def cmd_score(a):
    """death rate of each flag class vs all added lines, for flags recorded by an earlier round."""
    fl = json.load(open(a.flags))
    alive = alive_lines(a.head)
    out = {"flags_head": fl["head"], "head": git("rev-parse", a.head).strip(), "prs": {}}
    tot = collections.Counter()
    for pr, d in fl["prs"].items():
        row = {}
        for cls in ("added", "comment", "clone"):
            n = dead = 0
            for path, lines in d[cls].items():
                for ln in lines:
                    n += 1
                    dead += (d["sha"], path, ln) not in alive
            row[cls] = {"n": n, "dead": dead}
            tot[cls + "_n"] += n; tot[cls + "_dead"] += dead
        out["prs"][pr] = row
    out["total"] = {c: {"n": tot[c + "_n"], "dead": tot[c + "_dead"],
                        "death_rate": round(tot[c + "_dead"] / max(tot[c + "_n"], 1), 4)}
                    for c in ("added", "comment", "clone")}
    json.dump(out, sys.stdout, indent=1)

def cmd_deaths(a):
    prs = [p for p in merged_prs(a.head, a.k) if not p["bot"]]
    idx = pr_index(a.head)
    meta = {}
    for line in git("log", "--first-parent", "--format=%H%x1f%ct%x1f%b%x1e", a.head).split("\x1e"):
        line = line.strip("\n")
        if line:
            sha, ct, body = line.split("\x1f")
            meta[sha] = (int(ct), bool(re.search(r"claude\.ai/code|Co-Authored-By: Claude", body)))
    out = []
    for pr in prs:
        diff = parse_diff(pr["sha"])
        dels = sum(len(f["deleted"]) for f in diff.values())
        adds = sum(len(f["added"]) for f in diff.values())
        if dels < a.min_deleted or dels < 2 * adds:
            continue
        parent = pr["sha"] + "^"
        origins = collections.defaultdict(lambda: collections.Counter())
        for f in diff.values():
            if not f["old"] or not f["deleted"]:
                continue
            c = category(f["old"])
            blame = git("blame", "--line-porcelain", "-w", "-M", parent, "--", f["old"], check=False)
            lineno_to_sha, cur = {}, None
            for line in blame.split("\n"):
                m = re.match(r"^([0-9a-f]{40}) \d+ (\d+)", line)
                if m:
                    lineno_to_sha[int(m.group(2))] = m.group(1)
            for ln, text in f["deleted"].items():
                o = lineno_to_sha.get(ln)
                if not o:
                    continue
                kind = "comment" if COMMENT.match(text) else ("blank" if not text.strip() else "code")
                origins[o][(c, kind)] += 1
        rows = []
        for o, cnt in origins.items():
            ts, agent = meta.get(o, (None, None))
            if ts is None:
                ts = int(git("show", "-s", "--format=%ct", o).strip() or 0)
            rows.append({"origin": o, "origin_pr": idx.get(o), "origin_ts": ts, "agent": agent,
                         "age_days": round((pr["ts"] - ts) / 86400, 1),
                         "lines": {f"{c}/{k}": n for (c, k), n in cnt.items()}})
        out.append({"pr": pr["pr"], "subject": pr["subject"], "ts": pr["ts"], "deleted": dels,
                    "added": adds, "origins": rows})
        print(f"#{pr['pr']} deaths traced", file=sys.stderr)
    json.dump(out, sys.stdout, indent=1)

def cmd_recon(a):
    files = tree_files(a.head, cats=CODE)
    count, per = clone_index(files)
    ws = collections.defaultdict(lambda: {"src_lines": 0, "test_lines": 0, "stories_lines": 0,
                                          "sig": 0, "cloned": 0, "test_sig": 0, "test_cloned": 0,
                                          "test_cases": 0, "each": 0, "property": 0, "mock": 0,
                                          "test_files": 0, "blob": []})
    for p, text in files.items():
        c = category(p)
        w = ws[workspace(p)]
        n = text.count("\n") + 1
        sig, wins = per[p]
        hit = cloned_lines(sig, wins, count)
        if c == "test":
            w["test_lines"] += n; w["test_sig"] += len(sig); w["test_cloned"] += len(hit); w["test_files"] += 1
            w["test_cases"] += len(TEST_CASE.findall(text)); w["each"] += len(TEST_EACH.findall(text))
            w["property"] += len(PROPERTY.findall(text)); w["mock"] += len(MOCK.findall(text))
        elif c == "stories":
            w["stories_lines"] += n
        else:
            w["src_lines"] += n; w["sig"] += len(sig); w["cloned"] += len(hit)
            w["blob"].append(text)
    for name, w in ws.items():
        raw = "\n".join(w.pop("blob")).encode()
        w["compression"] = round(len(zlib.compress(raw, 9)) / len(raw), 3) if raw else None
    json.dump({"head": git("rev-parse", a.head).strip(), "workspaces": ws}, sys.stdout, indent=1)

def cmd_cochange(a):
    """per test file: share of commits touching it that also touch non-test source in the same workspace."""
    shas = [p["sha"] for p in merged_prs(a.head, a.k)]
    together = collections.Counter(); alone = collections.Counter()
    for sha in shas:
        paths = git("show", "--name-only", "--format=", sha).split()
        src_ws = {workspace(p) for p in paths if category(p) == "source"}
        for p in paths:
            if category(p) == "test":
                (together if workspace(p) in src_ws else alone)[p] += 1
    json.dump({"together": sum(together.values()), "alone": sum(alone.values())}, sys.stdout)

ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
for name in ("prs", "deaths", "recon", "cochange", "score"):
    s = sub.add_parser(name)
    s.add_argument("--head", default="origin/main")
    s.add_argument("--k", type=int, default=40)
    s.add_argument("--min-deleted", type=int, default=200)
    s.add_argument("--flags", help="prs: write flagged line locations here; score: read them")
ap.add_argument("--literals", action="store_true")
a = ap.parse_args()
LITERALS = a.literals
{"prs": cmd_prs, "deaths": cmd_deaths, "recon": cmd_recon, "cochange": cmd_cochange, "score": cmd_score}[a.cmd](a)
