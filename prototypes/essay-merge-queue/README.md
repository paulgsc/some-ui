# Open-question essay: why our merges wait in line (prototype)

A draft for the owner's judgment (#3387, epic #2980, run #3361). **This folder never merges.**
It holds a draft cut list, its narration, real stills, and what the pipeline can't draw yet.

| Path                                | What it is                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `cut/cut-list.proposed.json`        | All 16 scenes as the essay wants them, about 6 minutes. Eight use members the pipeline lacks (below).                                           |
| `cut/today/`                        | The same essay with only the 8 scenes the pipeline draws now. `cards-check` says ready. Rendered silent locally (`record:cards --voices none`). |
| `cut/make.py`                       | Writes both from one source. `cut/check-cards.ts` runs burn-ins' `prepare` on every card (copy it into `packages/ui/burn-ins` to run it).       |
| `narration.md`                      | The narration, scene by scene.                                                                                                                  |
| `cards/*.png`                       | One frame of each drawable card, from that render.                                                                                              |
| `stills/*.png`, `stills/pages.json` | Public GitHub pages, logged out, 1440×900 at 2×, each with its URL and capture time.                                                            |
| `charts/*.png`, `charts/make.py`    | The audit's numbers, drawn from `claude/ci-audit-data` (`prototypes/ci-audit`).                                                                 |
| `data/per_pr.json`                  | #3376 and #3377 split into could fail / couldn't / update-branch rerun, by the audit's own rules (`cls.py`).                                    |

## Shot list

| #     | Says                                                                           | Shows                                    | Source                           | Today?           |
| ----- | ------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------- | ---------------- |
| intro | An open question: where the time goes, what we chose, what we're asking        | flow card, the five parts                | —                                | yes              |
| P1    | One PR: four JSON files, no code                                               | GitHub: #3376 Files changed              | `stills/pr-3376-files.png`       | **no** (a page)  |
| P2    | Its run took 15m 39s; Rust CI and four Rust audits ran and couldn't fail       | GitHub: the run's job graph              | `stills/run-3376-graph.png`      | **no** (a page)  |
| P3    | The filter matched the JSON files as Rust                                      | terminal card, the log lines verbatim    | job 136968109800's log           | yes              |
| P4    | Why: `'!**/*.md'` under "some" matches nearly everything                       | terminal card of the YAML                | `_detect-changes.yml` @ 7a3dc3f  | yes              |
| P5    | 1,000 of 3,793 runner-minutes couldn't fail                                    | bar chart by job                         | `charts/jobs-couldnt-fail.png`   | **no** (a chart) |
| P6    | #3377: 86 min, 17.6 couldn't fail, 39.2 an update-branch rerun                 | bar chart, two PRs                       | `charts/two-small-prs.png`       | **no** (a chart) |
| P7    | Up to date: 38% of some-ui's PR minutes in one day, 16% of the server's        | bar chart, two repos                     | `charts/update-branch-share.png` | **no** (a chart) |
| P8    | The same PR, run again and again                                               | GitHub: Actions run list                 | `stills/actions-pr-runs.png`     | **no** (a page)  |
| K1    | The merge queue is offered to organizations' public repos; ours are a person's | GitHub Docs, "Who can use this feature?" | `stills/docs-merge-queue.png`    | **no** (a page)  |
| K2    | What a better pattern must keep                                                | cheat-sheet card                         | —                                | yes              |
| W1    | C1021: settle, then land 1–7 per bucket; CD1 fixed the filter                  | flow card                                | C1021, CI1                       | yes              |
| H1    | A red bucket, coarse reverts, cross-repo pairs, one runner pool                | cheat-sheet card, △                      | —                                | yes              |
| H2    | The server half of #3376 waited, then re-ran                                   | GitHub: server#1098 checks               | `stills/server-1098-checks.png`  | **no** (a page)  |
| Q1    | A free org? a merge train? gate after merge? yours?                            | cheat-sheet card, ✋                     | —                                | yes              |
| close | Sources, and where to answer                                                   | cheat-sheet card                         | —                                | yes              |

Other stills taken and not used yet: `pr-3376-checks.png` (workflows collapsed, logged out),
`pr-3377-checks.png`, `job-3376-jobs.png` (its log reads "Sign in to view logs"),
`server-1098-conversation.png`.

## Blockers, each with its smallest fix

1. **A GitHub page can't be a scene.** A cards essay takes only `card` and `screen`, and
   `screen.of` is `snips` or `clips`. Fix: one more member of `screen.of`, such as
   `{"from": "pages", "url", "capturedAt", "file", "at"?}`. It is a picture of a public page,
   stamped "as of" its capture, and handed by home as snips are. The capture is a sibling of
   the snips walk, writing `pages.json` like the one here. 5 scenes wait on it.
2. **No chart card.** The cards palette has terminal, cheat-sheet, flow, legend and rule,
   but nothing for magnitudes. Fix: one more card kind in `@some-ui/burn-ins`, a horizontal
   stacked bar (`bars-v1`), with the values in the cut list and its source in the stamp.
   3 scenes wait on it.
3. **The audit has no durable commit.** The stamp cites `some-ui@7012238`, on
   `claude/ci-audit-data`, a scratch branch. Fix: land the audit's data and scripts somewhere
   that stays (paulgsc/testing, or a merged `docs/` folder), then stamp that commit.
4. **Logged out, a job's log is hidden** ("Sign in to view logs"). P3 shows the real lines
   as a terminal card, taken from the API. No fix is needed unless the owner wants the
   page itself, which would need a signed-in capture.
5. **`cards-check` doesn't check the cards themselves.** It said ready while a badge was
   `wip` (not a state) and three cards had the wrong params; burn-ins' `prepare` refused
   all of them, as the render would have. Fix: have `cards-check` run `prepare` on each
   card burn-in at the series' frame.
6. **No silent chapter card, and a chapter is one scene.** In a spoken cards essay (v2+),
   every scene needs a spoken chapter line, said by the host. A chapter repeated across
   scenes is said again, and makes a second chapter mark ("0:32 The pain", "0:51 The
   pain" in `cards/description.txt`). The brief says chapter cards are silent. Fix: either
   the owner rules that a chapter line is said once per chapter, or a scene's `chapter`
   becomes optional after the first scene of a chapter (one change to `SpokenSchema` and
   `cardsScenes`).

## Numbers that differ from the brief

- **Update-branch reruns.** From `*-today.json`: some-ui 2,647 of **7,052** min (38%), not
  6,648 (40%). Server 798 of **4,893** min (16%), on 12 merge heads, not 899 of 3,762
  (24%). The run counts match (195 of 636, 105 of 900). The charts use the committed data.
- **#3376.** By `cls.py`'s rules, 14.2 of 33.1 min couldn't fail, not about 17.
- **#3377.** 17.6 min couldn't fail on its first run. With the whole 39.2-min
  update-branch rerun added, that's 56.8 min, which matches "about 55".

## Round 2 (2026-11-22): all 16 scenes, rendered

The blockers above are built on their own branches (`claude/cards-chapter-once`,
`claude/cards-bars`, `claude/screens-pages`, `claude/cards-check-prepare`). Merged
together locally, they render the whole essay, silent (`--voices none`), 5:52.

| Path | What |
| --- | --- |
| `full/merge-queue-2026-11-21.json` | The cut list: cheat-sheet v5, each chapter's line on its first scene only (C1027), the five GitHub pages as `{"from": "pages"}` screens, the three charts as `bars` cards. K1 now states the merge-queue limit as fact (the owner's check, #3387). |
| `full/description.txt` | Its chapters, each once. |
| `stills-full/*.png` | One frame per scene at its end; `K1-zoom.png` mid-scene, zoomed to "Who can use this feature?". |
| `pages/` | The pages as `record:pages` took them, logged out (`list.json` is its input). |
| `testing-recon/` | Item 5, staged for the coordinator to push to paulgsc/testing: `2026-11-21-ci-audit/` and the commit as a patch. The raw pulls (2.3 MB) are cut to a derived table, since testing's guard caps JSON at 256 KB a file and the tree at 4 MB; the derived files reproduce every headline number. |

The stamp names `paulgsc/testing@a5ec27e`, the staged commit; it becomes true once it's pushed.
