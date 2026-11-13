---
name: coordinate
description: How a coordinator session runs a choir of other cloud sessions across paulgsc/some-ui and paulgsc/server, and what the owner decides. Read it before spawning or messaging any worker session. Use when a session is asked to coordinate, run a choir, fan out work, start or steer other sessions, hand over to or take over from a coordinator, or merge a batch of PRs from several workers.
---

# coordinate

The rules the Nov 8–13 coordinator runs learned (#2814, with run records #2823, #2833 and
#2885). A later statement by the owner supersedes this file; fold it in here in a PR.

There are three roles. **You decide** is the owner. **Coordinator** is the session that holds
the plan, the ledger and the merge queue. **Choir** is every worker session it starts. Write
every Residual Ledger `first_step` in those three parts, in that order (#2814, Nov 9).

## You decide (the owner)

- The scope and its order. A reference like "items 20, 30, 31" means Residual Ledger items.
- Merge authority, stated in your own words in the coordinator's own session. Today it is
  full merge and push on every PR in some-ui, server and testing, including bot, changeset,
  image-publish and release PRs (#2885, Nov 12).
- Any step that submits to a review service, where a human examines what we send (AMO, and
  Google Play later), is yours alone. In your words: "Never merge an extension release PR.
  Never dispatch a publish to a review service. Never approve the `amo-release` environment."
  Docker Hub images, npm, and server and www release PRs are not review services (#2885,
  Nov 11–12; #2898).
- Approving Residual Ledger writes (each one prompts you), and anything that needs the box.
- Standing settings no session can make: `RELEASE_BOT_TOKEN`, and the repositories a
  scheduled task's sessions get (#2885).

## Coordinator

### Starting cold

- Read this skill before spawning or messaging anyone (#2814, Nov 13).
- Sweep both repos. On server, list open `priority: high` issues (server `CLAUDE.md`); if
  your session can't read server issues, have a server-started worker run it (#2833). On
  some-ui, list open `kind:defect` issues, which come first, and `ask` issues.
- Read every open Residual Ledger item's `status`, `summary`, `first_step` and `keywords`, not
  only the ones flagged "Waits on you" (#2814, Nov 13).
- Map each owner reference to a ledger item, never to a list of your own. Confirm the mapping
  back in one line before any work starts (#2814, Nov 13).
- Check the last run's record issue against live GitHub before trusting its queue (#2885,
  Nov 11).
- Open one `[ORCH]` record issue for the run, holding the scope, rules, roster, call-ID
  ranges, merge queue and where we are. It is the shared channel: never broadcast the same
  text to every worker (#2823, #2833).

### At spawn time

- Start each worker in the repo it pushes to. Split a cross-repo story into one worker per
  repo, and name the hand-off in both briefs (#2823; #2814, Nov 13).
- Before splitting, check what each worker can reach. `add_repo` push to the other repo, and
  comments on the other repo's issues, are often refused (#2814, Nov 8 and Nov 13).
- Put every rule a worker needs in its brief, in full. Server sessions can't read some-ui
  issues (#2814, Nov 10).
- Pass the owner's words verbatim, then add your reading after them, marked as yours (#2814,
  Nov 10).
- Before any merge, write the owner's grant verbatim, with its date and session, in each epic
  the run touches, one per repo. Each repo's steward accepts a grant written in that work's
  epic and scoped to its repo, and refuses one passed along only by message. The grant
  licenses the coordinator's merges (#2814, Nov 10 and Nov 13).
- Say in each brief how a head is reviewed when Codex is out of credits:
  - On some-ui, use the independent fresh-context review in `.claude/skills/steward/SKILL.md`
    ("Review coverage on every head").
  - Server's steward counts only bot review. On server, that fallback holds only when the
    owner extends it for the run; write that grant in the epic as well (#2814, Nov 13).
- Hand each worker a call-ID range for `docs/calls.json`, and keep the next free ID on the
  record issue (#2814, Nov 9).
- Be the only writer of the ledger and of every epic body (#2823, #2833).
- Copy session ids from the roster; never retype them (#2814, Nov 8).
- Put the choir's protocol (below) in every brief.

### Admission by free runners

The bottleneck is GitHub's shared runner pool, not the number of open PRs. A PR at k of its n
jobs has already freed n−k runners, so admitting one PR per repo is the worst case, not a safe
default (owner, #2814 Nov 10; measurements on #2833).

- Admit the next ready PR to CI whenever no job is queued in either repo.
- A PR that is waiting on review, on a dependency or on the owner holds no slot.
- Both repos require branches to be up to date. Update a PR once, at ready time (green and
  reviewed), never on every merge: `update_pull_request_branch`, then `enable_pr_auto_merge`.
- Merge first whichever PR is first green and reviewed. Up to date makes server merges serial
  in practice, so set their order explicitly (#2885, Nov 11).
- Treat real dependencies as edges, not as a global queue. Examples: the ledger step, the
  route snapshot, a bookkeeping PR after its server PR.
- Merge the image or release bot PR last, so one publish carries every content PR (#2833,
  #2885).

### While running

- While any PR is in CI, set a `send_later` timer about every 20 minutes and check every open
  PR yourself. Never wait on events alone (#2823).
- Re-check a "clean" PR directly. When a re-run turns a PR green, re-arm auto-merge or merge
  it, because a refused auto-merge does not re-arm itself (#2814, Nov 9).
- You are the merger, so never stand down from babysitting a PR you are to merge (babysit's
  stand-down waits on a human merger).
- Before merging, check the head and every check run yourself. Merge with `expectedHeadSha`
  set to the full 40-character SHA; any other spelling is ignored (#2885; #2814, Nov 10).
- On the timer, read each worker's `external_metadata.context_usage`. Above about 70%, have
  the worker wind down and hand its work to a fresh session. Hand over yourself at about 80%
  (#2885).
- A message reaches a session mid-turn only when its turn ends, sometimes batched with
  others. Restate whatever it supersedes (#2814, Nov 10).
- Never pipe a command whose exit code matters (#2814, Nov 10; server `CLAUDE.md`).
- A bot PR pushed with `GITHUB_TOKEN` runs no CI. To start it:

  - approve its `action_required` runs (`actions_run_trigger` → `rerun_workflow_run`), again
    after each regeneration of the www release PR;
  - or, when it is behind, use Update branch as a person.

  Never push an empty commit, and never close and reopen (#2814, Nov 10; #2885).

- A server PR whose last check is CodeQL can sit on `PR gate` for hours: dispatch
  `gate-verdict.yml` with no inputs (#2885, Nov 12; server #814).
- Don't send `@dependabot` commands through the GitHub MCP tool, which mangles the body. Use
  Update branch at merge time (#2814, Nov 13).
- The assurance ledger's order (CLAUDE.md "Operational assurance", #2306) cuts both ways:
  - Place a `server:` evidence path only after the file exists on server main (#2814, Nov 10).
  - For a new server table, hold the some-ui ledger PR with auto-merge off. When the server
    PR is otherwise green, merge the ledger PR, re-run only the server PR's Assurance and
    `PR gate` jobs, then merge the server PR at once (#2885, Nov 11).
- Sequence every change to what home's stage draws first. Then make one www release and one
  pin move at the end (#2814, Nov 8).
- Split scope that arrives during review into a second PR on each side (#2885, Nov 12).
- Ship a cross-repo dependency inside the PR that consumes it, and verify a digest against
  the publish run's log (#2885, Nov 12).
- Check a fact against its primary source (merged PRs, tables, the code) before relaying it
  (#2814; #2885, Nov 12).
- When the owner is away (#2823):
  - keep everything that needs the box off the critical path;
  - put every home step in one list on the record issue;
  - batch ledger writes for when the owner is back (#2885).
- Be the hand-off point for anything a session can't place itself: ledger lines, a comment
  in a repo it can't reach, its session note (#2814, Nov 10).
- Prefer handing new work to a running worker in the same repo and area, unless its context
  is high. There is no measured rule yet for sizing sessions (#2814).

### Winding down

- Push each worker's session note to paulgsc/testing `sessions/`, after running
  `python3 scripts/guard.py --staged` there, and confirm it to the worker before it archives
  (SFEED9; #2885, Nov 12).
- Write the closing record on the run's `[ORCH]` issue. List the merged PRs in both repos,
  what waits on the owner, the follow-ups filed, and the lessons. Lessons become rules here,
  through a PR.
- Then follow CLAUDE.md "Multi-session relay work" for epics, the ledger and your own note.
- To hand over mid-run:
  - name the successor on the record issue;
  - have the owner restate merge authority in the successor's own session;
  - tell every active worker the successor's id;
  - confirm the queue with the successor, then archive (#2885).

## Choir

- Build and verify locally, in parallel. A pushed branch with no PR runs no CI (#2823).
- Before a some-ui PR, run the whole `www` vitest suite, not only the folders you touched
  (#2814, Nov 9).
- When your branch is ready, send the coordinator `ready <name> <repo> <branch>`, and open the
  PR only once you are admitted (#2823).
- Drive your PR green and reviewed. Check its state yourself at least every 20 minutes, not
  only on events (#2823).
- Send a red check that isn't yours to the coordinator before any re-run (#2823).
- Never merge. Send the coordinator `ready-to-merge <repo>#<n> <40-char sha>` (#2885).
- Never push to testing. Once the coordinator says merged, confirm, then send it your ledger
  lines, your "Where we are" lines and your session note's JSON (#2885, Nov 12).
- Archive only once the coordinator confirms your note is in (SFEED9).
- Use only your call-ID range. Send anything you can't place yourself to the coordinator.
- Raise any drift you find to the coordinator; don't build around it (#2814, Nov 9).
