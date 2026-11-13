---
name: coordinate
description: How a coordinator session runs a choir of other cloud sessions across paulgsc/some-ui and paulgsc/server, and what the owner decides. Read it before spawning or messaging any worker session. Use when a session is asked to coordinate, run a choir, fan out work, start or steer other sessions, hand over to or take over from a coordinator, or merge a batch of PRs from several workers.
---

# coordinate

Rules four coordinator runs paid to learn (Nov 8 to Nov 13, 2026). Each line says what to do
and where it was learned, so read the issue only when a rule is unclear. The full record is
#2814 (recon) and the run records #2823 (Nov 9), #2833 (Nov 10) and #2885 (Nov 11–12). This
file is the source of truth; an issue comment that contradicts it is history.

There are three roles. **You decide** is the owner. **Coordinator** is the session that holds
the plan, the ledger and the merge queue. **Choir** is every worker session it starts. Write
every Residual Ledger `first_step` in those three parts, in that order (#2814, Nov 9).

## You decide (the owner)

- The scope and its order; a reference like "items 20, 30, 31" means Residual Ledger items.
- Merge authority, stated in your own words in the coordinator's session. Today it is full
  merge and push on every PR in some-ui, server and testing, bot, changeset, image and release
  PRs included (#2885, Nov 12).
- Any step that submits to a review service, where a human examines what we send (AMO, Google
  Play): yours alone. Docker Hub, npm and release PRs are not review services (#2885, #2898).
- Approving a Residual Ledger write when it prompts, and anything that needs the box at home.
- Which lessons become rules here.

## Coordinator

### Starting cold

- Read this skill before spawning or messaging anyone (#2814, Nov 13: a coordinator that
  skipped the record rebuilt a superseded rule).
- Run each repo's sweep: server's open `priority: high` issues (server `CLAUDE.md`), and
  some-ui's open `kind:defect` and `ask` issues (some-ui `CLAUDE.md`).
- Read every open Residual Ledger item's `status`, `summary`, `first_step` and `keywords`, not
  only the "Waits on you" ones (#2814, Nov 13).
- Map each owner reference to a ledger item, never to a list of your own, and confirm the
  mapping back in one line before starting work (#2814, Nov 13: three workers started on the
  wrong items).
- Read the last run's record issue and check its open queue against live GitHub before
  trusting it (#2885, handoff).
- Open one `[ORCH]` record issue for the run: scope, rules, roster, call-ID ranges, merge
  queue, where we are. It is the shared channel; never broadcast the same text to every
  worker (#2814, Nov 8 hypothesis 10).

### At spawn time

- Start each worker in the repo it pushes to. Split a cross-repo story into one worker per
  repo, and name the hand-off between them in both briefs (#2823; #2814, Nov 13 item 4).
- Before splitting, check what each worker can reach: `add_repo` push to the other repo and
  comments on the other repo's issues are often refused (#2814, Nov 8 and Nov 13).
- Give each worker its testing access, or plan for the coordinator to push its session note.
  Default to the coordinator pushing notes (#2833; #2885, Nov 12).
- Put every rule a worker needs in its brief in full: server sessions can't read some-ui
  issues (#2814, Nov 10).
- Pass the owner's words verbatim, then your reading after them, marked as yours (#2814,
  Nov 10: a paraphrase relayed the design wrong twice).
- Write the owner's merge grant, quoting them, in each epic the run touches, scoped to its
  repo, before any worker asks: each repo's steward accepts only the owner's own words in
  that work's epic, never a relay (#2814, Nov 10 and Nov 13 item 3).
- Give every worker the review fallback for when Codex is out of credits: the independent
  fresh-context review in some-ui's `.claude/skills/steward/SKILL.md` ("Review coverage on
  every head"). Say in the brief that it covers server PRs too (#2814, Nov 13 item 2; #2885).
- Hand each worker a call-ID range for `docs/calls.json`, and record the next free ID on the
  record issue (#2814, Nov 9: C27 and C43 were taken twice).
- Name one ledger writer, the coordinator, and one writer per epic body (#2823; #2833).
- State the end-of-run protocol in every brief (below).
- Copy session ids from the roster, never retype them: a typo fails silently (#2814, Nov 8).

### Admission by free runners

The bottleneck is GitHub's shared runner pool, not the PR count. A PR at k of its n jobs has
already freed n−k runners, so one PR per repo is the worst case, not a safe default (owner,
#2814 Nov 10; measurements on #2833).

- Admit the next ready PR to CI whenever no job is queued across both repos.
- A PR waiting on review, a dependency or the owner holds no slot.
- Both repos require branches up to date: update once, at ready time (green and reviewed),
  never on every merge (`update_pull_request_branch`, then `enable_pr_auto_merge`).
- The first PR that is green and reviewed merges first.
- Real dependencies are edges, not a global queue: the ledger step, the route snapshot, a
  bookkeeping PR after its server PR, an image PR after the content it publishes.
- Workers build and verify locally in parallel; a pushed branch with no PR runs no CI (#2823).
- A red check that isn't the worker's goes to the coordinator before any re-run (#2823).

### While running

- While any PR is in CI, set a `send_later` timer about every 20 minutes and check every open
  PR yourself; never wait on events alone (#2823: a green PR sat 1 h 45 m).
- Re-check a "clean" PR directly. After a re-run turns a PR green, re-arm auto-merge or merge
  it: a refused auto-merge does not re-arm itself (#2814, Nov 9).
- On the timer, check each worker's `external_metadata.context_usage`; above about 70%, have it
  wind down and hand its work to a fresh session (#2885, rule 8).
- Expect messages to a session mid-turn to arrive late and batched, at its turn end; restate
  what was superseded (#2814, Nov 10).
- Merge with `expectedHeadSha` set to the full 40-character SHA; any other spelling is
  ignored (#2814, Nov 10).
- Never pipe a command whose exit code matters (`| tail` hides it) (#2814, Nov 10).
- A bot PR pushed with `GITHUB_TOKEN` runs no CI. Kick it by Update branch as a person when it
  is behind, or approve its `action_required` runs (`actions_run_trigger` →
  `rerun_workflow_run`). Never an empty commit, never close and reopen (#2814, Nov 10; #2885).
- A server PR whose last check is CodeQL can sit on `PR gate` for hours: dispatch
  `gate-verdict.yml` with no inputs (#2885, Nov 12; server #814).
- Don't send `@dependabot` commands through the GitHub MCP tool: the body arrives mangled. Use
  Update branch at merge time (#2814, Nov 13 item 5).
- Order assurance-ledger edits both ways (#2306): a new server table or process family is
  placed in some-ui's `packages/assurance/src/ledger.json` right before its server PR merges,
  and a `server:` evidence path only after the file exists on server main (#2814, Nov 10).
- A new server route module needs its family placed before the route snapshot bot PR can go
  green (#2833: #2846 before #2847).
- Sequence every change to what home's stage draws first, then one www release and one pin
  move at the end (#2814, Nov 8: pins moved three times).
- Split scope that arrives during review into a second PR on each side; don't widen a PR in
  review (#2885, Nov 12).
- Ship a cross-repo dependency inside the consumer's PR where it can (a digest bump in the
  server PR that reads it), and verify a digest against the publish run's log (#2885, Nov 12).
- Owner away (rule 8, #2823): keep everything that needs the box off the critical path, put
  every home step in one list on the record issue, and batch ledger writes for when the
  owner is back, since each one prompts them (#2885).
- Be the hand-off point for anything a session can't place: ledger lines, comments in a repo
  it can't reach, a note it can't push (#2814, Nov 10).

### Winding down

- Push each worker's session note to paulgsc/testing `sessions/` (`python3 scripts/guard.py
--staged` there first), confirm it, and only then let the worker archive (SFEED9; CLAUDE.md
  "Multi-session relay work").
- Write the closing record on the run's `[ORCH]` issue: merged PRs in both repos, what waits
  on the owner, filed follow-ups, lessons. Add lessons here, as rules, in a PR.
- Update every touched epic's "Where we are" and ledger item, add a `log` entry, then distill
  your own note and archive yourself.
- Handing over mid-run: name the successor on the record issue, have the owner restate merge
  authority in the successor's own session, and confirm the queue before archiving (#2885).

## Choir

- Build and verify locally, including the whole `www` vitest suite before a some-ui PR (#2814,
  Nov 9).
- Open your PR only when the coordinator admits it; drive it green and reviewed, checking your
  own PR's state at least every 20 minutes, not only on events (#2823).
- Never merge unless your brief grants it in the owner's words. Send the coordinator
  `ready-to-merge <repo>#<n> <40-char sha>` (#2885).
- After the coordinator says merged: confirm, send your ledger lines and "Where we are" lines,
  and send your session note JSON. Don't push to testing unless the brief says to (#2885,
  Nov 12).
- Archive only once the coordinator confirms your note is in (SFEED9).
- Use only your call-ID range. Send anything you can't place (a comment in the other repo, a
  ledger field) to the coordinator.
- Raise drift you find (a rule that contradicts another, a stale epic body) to the
  coordinator; don't build around it (#2814, Nov 9).
