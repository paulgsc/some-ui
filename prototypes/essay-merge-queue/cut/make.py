"""The draft cut list for the open-question essay (#3387), in two forms:

- cut-list.proposed.json: every scene as the essay wants it, with GitHub pages
  as `{"kind":"screen","of":{"from":"pages",...}}` and charts as a `bars` card,
  two members the pipeline doesn't have yet (see ../README.md, "Blockers");
- cut-list.today.json: the same essay with only what the pipeline draws now
  (cards), each blocked scene dropped, so `cards-check` can judge the rest.
"""
import json, os, re
OUT = os.path.dirname(os.path.abspath(__file__))
MAIN = "7a3dc3ff1174fcdca875b0b3a6824901375d8e24"
WPS = 2.6  # spoken words a second, a working guess for the draft's lengths

def ms(*texts):
    words = sum(len(t.split()) for t in texts)
    return int(round(words / WPS * 1000 + 1500, -2))

def card(kind, **params):
    return {"picture": {"kind": "card"}, "burnIns": [{"kind": kind, "params": params}]}

def page(still, url, at=None):
    of = {"from": "pages", "url": url, "capturedAt": "2026-11-21", "file": f"{still}.png"}
    if at: of["at"] = at
    return {"picture": {"kind": "screen", "of": of}, "burnIns": [], "blocked": "pages"}

def bars(chart, title):
    return {"picture": {"kind": "card"}, "burnIns": [{"kind": "bars", "params": {"kicker": "CHART", "title": title, "from": f"charts/{chart}.html"}}], "blocked": "bars"}

S = []
def scene(id, look, chapter, narration):
    S.append({"id": id, **look, "spoken": {"role": "scene", "chapter": chapter, "narration": narration}})

intro_said = ("This is an open question, not an explainer. Two repositories, one person, and a crowd of agent sessions all "
    "merge into GitHub on a free personal account, and the merges wait in line. I'll show where the time goes, "
    "with the numbers, what we settled on, and why we still don't like it. If you know a better pattern that "
    "stays on GitHub and costs nothing, that's the part I'm asking for. It's as of November twenty-first, "
    "twenty twenty-six.")
S.append({"id": "intro", **card("flow", kicker="OPEN QUESTION", title="Why our merges wait in line",
    steps=[{"badge": "main", "label": "The pain", "note": "Measured in runner-minutes"},
           {"badge": "main", "label": "The constraints", "note": "GitHub, a free account"},
           {"badge": "main", "label": "What we chose", "note": "Settle first, land in buckets"},
           {"badge": "gap", "label": "What still hurts"},
           {"badge": "you", "label": "The open question", "note": "Your better idea"}]),
    "spoken": {"role": "intro", "said": intro_said}})

C1 = "Chapter one. The pain."
scene("P1", page("pr-3376-files", "https://github.com/paulgsc/some-ui/pull/3376/files"), C1,
    "Start with one small pull request. It adds three records of decisions and one line to a ledger. Four JSON "
    "files, sixty-one lines, and no code at all.")
scene("P2", page("run-3376-graph", "https://github.com/paulgsc/some-ui/actions/runs/44944305421"), C1,
    "Its main workflow ran for fifteen and a half minutes of wall time, and thirty-three runner-minutes in all. "
    "The Rust build, the Rust tests and four Rust dependency audits all ran, and all passed. The pull request "
    "touched no Rust, so none of them could have failed.")
scene("P3", card("terminal", kicker="LOG · WHY THEY RAN", title="The filter matched four JSON files as Rust",
    bar="changes / Detect Changed Paths · run 44944305421",
    lines=[{"keyword": "Filter rust", "text": " = true", "badge": "gap"},
           {"text": "docs/calls/C1013.json [added]"},
           {"text": "docs/calls/C1014.json [added]"},
           {"text": "docs/calls/C1015.json [added]"},
           {"text": "packages/assurance/src/ledger.json [modified]"},
           {"keyword": "Filter node", "text": " = true"}]), C1,
    "The job that decides what runs logged why. A filter called rust matched every one of the four files. Logged "
    "out, GitHub shows this log only to people signed in, so these lines are copied from it, word for word.")
scene("P4", card("terminal", kicker=f"CODE · _detect-changes.yml @ {MAIN[:7]}", title="A negation, read as one more way to match",
    bar=".github/workflows/_detect-changes.yml",
    lines=[{"keyword": "rust:"},
           {"text": "  - 'crates/**'"},
           {"text": "  - 'Cargo.toml'"},
           {"text": "  - 'Cargo.lock'"},
           {"text": "  - 'nix/**'"},
           {"text": "  - '!**/*.md'", "comment": "  # matches any file not Markdown", "badge": "gap"}]), C1,
    "Here is the cause. Each list ends with a pattern meant to leave Markdown out. But the filter's default rule is "
    "that a file counts when any one pattern matches it, and 'not Markdown' matches nearly every file there is. "
    "So the Rust flag and the Node flag were on for almost every pull request.")
scene("P5", bars("jobs-couldnt-fail", "1,000 of 3,793 runner-minutes couldn't fail"), C1,
    "Over the last thirty merged pull requests, that's a thousand of three thousand eight hundred runner-minutes, "
    "about a quarter, spent on jobs the change could not fail. Most of it is the Rust audits, on twenty-eight "
    "pull requests that had no Rust in them.")
scene("P6", bars("two-small-prs", "Two small PRs, in runner-minutes"), C1,
    "The next pull request changed one test fixture and spent eighty-six minutes. Seventeen of them couldn't fail. "
    "Thirty-nine more were the whole suite run again, because another branch had merged first and this one had "
    "to catch up.")
scene("P7", bars("update-branch-share", "A merge of main, then every PR runs again"), C1,
    "Catching up is the bigger cost. Both repositories require a branch to be up to date before it merges. So "
    "each merge puts every open pull request behind, and each one runs its whole suite again with no change of "
    "its own. On one day, that was thirty-eight percent of the minutes here, and sixteen percent on the server.")
scene("P8", page("actions-pr-runs", "https://github.com/paulgsc/some-ui/actions?query=event%3Apull_request"), C1,
    "In the list of runs it looks like this: the same pull request, run again and again, each time triggered by "
    "a synchronize that carried someone else's merge. And through all of it, every red check that day was a "
    "flaky test or a red we had planned. Review found every real fault.")

C2 = "Chapter two. The constraints."
scene("K1", page("docs-merge-queue", "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue",
    at=["who-can-use"]), C2,
    "The tool built for this is GitHub's merge queue. It gives the same safety as up to date, without making "
    "each author re-run. GitHub's own page says who gets it: public repositories owned by an organization, or "
    "private ones on Enterprise Cloud. Both of ours belong to a personal account.")
scene("K2", card("cheat-sheet", kicker="CONSTRAINTS", title="What a better pattern has to keep",
    rows=[{"task": "GitHub", "command": "github.com", "note": "the code, the runs and the reviews stay there"},
          {"task": "Free", "command": "$0 a month", "note": "no paid plan, no runner minutes bought"},
          {"task": "Up to date", "command": "strict status checks", "note": "main is never red from two green branches"},
          {"task": "CI stays", "command": "CI Gate", "note": "it is what makes drift loud"}]), C2,
    "So the answer has to keep four things. It stays on GitHub. It costs nothing. Main never goes red because two "
    "green branches met for the first time after merging. And CI stays, because it is what makes drift loud, "
    "even on the days it finds nothing.")

C3 = "Chapter three. What we chose."
scene("W1", card("flow", kicker="CALL C1021 · BUCKETS", title="Settle every branch, then land them together",
    steps=[{"badge": "main", "label": "Settle", "note": "Review, fixes and local checks, before any PR"},
           {"badge": "main", "label": "Bucket", "note": "Three to five settled branches in one PR"},
           {"badge": "main", "label": "One CI round", "note": "Instead of one per branch, per merge"},
           {"badge": "pr", "label": "Fix the filter", "note": "CI1, with two gates, in flight"}]), C3,
    "What we settled on has two parts. First, a branch does all its settling before it ever opens a pull request: "
    "review, fixes, and the checks a laptop can run. Then three to five settled branches land together in one "
    "bucket, so one CI round covers all of them. Second, fix the filter, so a change only runs the jobs it can fail.")

C4 = "Chapter four. What still hurts."
scene("H1", card("cheat-sheet", kicker="STILL HURTS", title="What buckets don't fix",
    rows=[{"task": "A red bucket", "command": "3-5 branches wait", "note": "one flaky test holds back every branch in it", "badge": "gap"},
          {"task": "A revert", "command": "pick it out of a bucket", "note": "is coarser: it lands with its bucket", "badge": "gap"},
          {"task": "Pairs", "command": "some-ui, then server", "note": "a ledger or fixture lands here first, then the server re-runs", "badge": "gap"},
          {"task": "One pool", "command": "both repos, one queue", "note": "both repos share the runners; the queue never clears", "badge": "gap"}]), C4,
    "Buckets trade one pain for others. A single flaky test now holds back several branches, not one. Reverting "
    "a feature means picking it back out of a bucket. Changes that come in pairs across the two repositories "
    "still go one after the other. And both repositories share one pool of runners, so under load the queue "
    "never clears.")
scene("H2", page("server-1098-checks", "https://github.com/paulgsc/server/pull/1098/checks"), C4,
    "This is the other half of the first pull request. The server change had to wait until the ledger line had "
    "landed, and then its own check against the other repository was run again before it could merge.")

C5 = "Chapter five. The open question."
scene("Q1", card("cheat-sheet", kicker="OPEN QUESTION", title="Is there a better pattern, free, on GitHub?",
    rows=[{"task": "An organization", "command": "transfer to a free org", "note": "move the repos to a free organization: the queue is offered there", "badge": "you"},
          {"task": "A merge train", "command": "bot/train", "note": "a bot branch that tests a batch once, then fast-forwards main", "badge": "you"},
          {"task": "Gate after merge", "command": "revert on red", "note": "loose gate on the PR, full suite on main, revert on red", "badge": "you"},
          {"task": "Your idea", "command": "#3387", "note": "the one we haven't thought of", "badge": "you"}]), C5,
    "Here's where I'd like help. A free organization seems to get the merge queue on public repositories, so "
    "moving there might be the whole answer, if nothing else breaks. Or a train: a bot branch that tests a "
    "batch once and then fast-forwards main. Or a looser gate on the pull request, the full suite on main, and "
    "a revert when it goes red. Each one gives something up. Which would you pick, or what are we missing?")

S.append({"id": "close", **card("cheat-sheet", kicker="SOURCES", title="Every number here is public",
    rows=[{"task": "The two PRs", "command": "paulgsc/some-ui#3376, #3377"},
          {"task": "The audit", "command": "prototypes/ci-audit", "note": "branch claude/ci-audit-data: data and scripts"},
          {"task": "The filter", "command": ".github/workflows/_detect-changes.yml"},
          {"task": "The queue", "command": "docs.github.com: Managing a merge queue"},
          {"task": "Answer here", "command": "paulgsc/some-ui#3387", "badge": "you"}]),
    "spoken": {"role": "close", "said": "The audit's data and scripts, and the workflow file, are public in the "
    "some-ui repository, and the description links each. If you have a pattern that keeps all four constraints, "
    "the issue is open."}})

for s in S:
    sp = s["spoken"]
    s["durationMs"] = ms(*(v for k, v in sp.items() if k != "role"))

def cut(shots):
    return {"schema": "some-ui.cut-list/2", "title": "Why our merges wait in line on a free GitHub account",
            "series": {"id": "cheat-sheet", "version": 2}, "look": "plain", "voice": "read",
            "shots": shots, "burnIns": [],
            "stamp": {"sources": [f"paulgsc/some-ui@{MAIN[:7]}", "paulgsc/some-ui@7012238"], "date": "2026-11-21"}}

proposed = [{k: v for k, v in s.items() if k != "blocked"} for s in S]
today = [{k: v for k, v in s.items() if k != "blocked"} for s in S if "blocked" not in s]
json.dump(cut(proposed), open(f"{OUT}/cut-list.proposed.json", "w"), indent=2, ensure_ascii=False)
os.makedirs(f"{OUT}/today", exist_ok=True)
json.dump(cut(today), open(f"{OUT}/today/merge-queue-2026-11-21.json", "w"), indent=2, ensure_ascii=False)
json.dump({"schema": "some-ui.cards-index/1", "essays": [{"key": "merge-queue-2026-11-21"}]}, open(f"{OUT}/today/index.json", "w"), indent=2)
total = sum(s["durationMs"] for s in S)
print(len(S), "scenes,", len(today), "drawable today,", round(total/60000, 1), "min estimated")
