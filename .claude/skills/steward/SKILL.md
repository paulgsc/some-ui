---
name: steward
description: Repo-specific PR-driving policy Claude Code consults before acting on CI, review, or merge events for a PR it opened or drives on the author's behalf — auto-merge mechanics, bot-review handling, and the re-review-request idiom this repo's bot reviewer needs. Takes precedence over generic PR-driving judgment; consulted automatically, not meant for direct/manual invocation. See babysit/SKILL.md for the separate polling-cadence policy — this file does not restate it.
---

# steward

Mechanics for driving a PR to green in this repo, distilled from this org's own multi-session
relay history — long-running stories that span many sessions, each one picking up from a
self-contained handoff the previous session wrote (see `handoff-template.md` in this
directory). Nothing here weakens a "never" rule the parent Claude Code instructions state
(skip a real CI failure, disable or quarantine a test, rewrite someone else's branch history,
widen a PR beyond what a finding needs) — it only nails down mechanics sessions on this relay
have gotten wrong before, so the next one doesn't have to relearn them.

## Re-request review after every push

`chatgpt-codex-connector` (this repo's bot reviewer) only reviews a PR on open,
ready-for-review, or an explicit mention by default — **not on every subsequent push,
including a rebase**. A rebase changes the head SHA even when the diff content doesn't, and
`babysit/SKILL.md`'s review-coverage check matches that exact SHA — skip the request on a
rebase and the PR can never satisfy that check again, however many check-ins pass. After
every push that changes the head SHA, leave a PR comment explicitly requesting review
(`@codex review`) before waiting on anything else.

## Treat every bot finding as a bug report until traced and disproven

Across this org's relay history the false-positive rate on Codex findings has been at or near
zero, repeatedly, across unrelated stories and unrelated packages. Don't rubber-stamp a finding
and don't wave one off as noise without tracing it against the actual code/DOM/data semantics
involved. When a finding is real: fix it, reply on the _specific_ review comment/thread (not a
general PR comment) naming the fix and its commit SHA, then resolve that thread. When a finding
is real but genuinely out of scope for this PR: reply explaining why and where the real fix is
routed (a follow-up issue, a named future story), and leave the thread **open** — don't resolve
away feedback that's still true just because fixing it isn't this PR's job.

## Cap the review-fix cycle — a diff has no upper bound on how many findings it can surface

A fix's own diff is new surface area for the next review, and there is no a priori bound on
how many rounds that can take — this canon's own landing PR hit real, escalating findings for
seven straight rounds, each fix surfacing ground the previous rounds hadn't touched. "Treat
every finding as real" (above) is still correct, but combined with an unconditional
re-request-after-every-push idiom it has no natural stopping point, and every round costs real
tokens.

**After 3 review rounds since the PR was opened**, stop auto-requesting the next review. Before
checking in, read what the pattern of rounds actually shows:

- **Converging** (later rounds smaller, more marginal, unrelated to each other) — accept the
  residual and stop asking for more review. A PR doesn't need a zero-finding steady state to be
  mergeable; note any outstanding nitpick on its own thread and proceed once the other merge
  criteria hold.
- **Escalating or clustering** (each fix reveals a structurally adjacent bug in the same area —
  the way a single SHA-matching requirement kept cascading into every file that referenced it
  here) — that's a smell that the underlying change, not any individual fix, may need a
  structural rework or a narrower re-scoping. Don't keep auto-patching through it. **What to do
  instead depends on where the cluster sits**, the same scope split the terminal disposition
  below uses (bot-found, on this rule's own PR: an earlier draft said "file it and land the PR
  anyway" unconditionally here, which contradicted both that disposition — it routes
  non-converging _in-scope_ defects back into this very bucket — and the invariant further down
  that a known in-scope defect is never merged):
  - **Clustered outside this PR's scope** — a pre-existing structure the diff keeps colliding
    with rather than one it introduced: **file the structural gap as a tracked issue and land the
    PR**, per the disposition rule below.
  - **Clustered in behavior this PR itself introduced** — rework or narrow the change before
    merging. That is work to do, not a handoff, and not something a tracked issue substitutes
    for: filing it would land a defect this PR is responsible for. If the rework itself will not
    converge, _that_ is the point to put the shape of the change to the user — with the PR
    explicitly not mergeable, which is a legitimate reason to wait and the only one left.
- **Genuinely unclear which** — treat it as in-scope until shown otherwise, and say so when you
  summarize; guessing "out of scope" is the expensive direction to be wrong in, since it files a
  defect instead of fixing one.

Either way, summarize the pattern for the user (how many rounds, how many findings were real,
which bucket above) — as a report of what you did, not a request for permission.
This gates the _automatic_ continuation only — it never excuses dropping a still-open real
finding just to stay under the cap, and it doesn't apply retroactively to rounds already spent;
it only stops the _next_ auto-triggered one.

The cap stops the automatic _seeking_ of new findings, not the ability to confirm coverage on
the head you actually land on: after picking a bucket above and pushing whatever fix that
implies, one closing review of that resulting head is still allowed. Auto-merge and
`babysit/SKILL.md` both require confirmed coverage on the _exact_ current head, so a capped PR
could otherwise never legitimately merge at all.

**That closing review's own outcome is final — by severity, not by requesting yet another
review of whatever it finds** (an earlier version of this rule just said "one closing review,"
which only pushed the same deadlock back one step: if that review itself found something,
fixing it produced yet another uncovered head with no policy-compliant next move). Read the
closing review's finding, if any, this way instead:

- **Clean, or only trivial/low-risk** (documentation, phrasing, additive text, anything that
  doesn't change real behavior or a load-bearing rule) — fix it directly and merge. A small fix
  doesn't need its own re-review; this org's near-zero false-positive rate on bot findings is
  the evidence that's safe, and re-review-forever is exactly the cost this cap exists to bound.
- **Substantive** (changes real behavior, logic, or a load-bearing rule) — fix what is in this
  PR's scope, **file whatever is left as a tracked issue on the same milestone as the issue this
  PR closes**, push, and take **one confirming review of that resulting head** before merging.
  Do not stand down and wait for a human to merge it by hand.

  That confirming review is the one carve-out to the cap, and it earns it by _confirming_ rather
  than seeking: the head it covers is a targeted fix for findings already raised, not new surface
  anyone went looking for. **Dispose of what it returns by _kind_, never by round count:**

  - **Out of this PR's scope** — file on the milestone and merge, exactly as above. Do not fix
    it; another fix would produce another uncovered head and restart the regress this whole cap
    exists to bound, and filing records the gap without doing so.
  - **An in-scope defect — including one the targeted fix itself just introduced** — fix it and
    take another confirming review. **The cap never licenses merging a defect you already know
    about.** It bounds the _search_ for new findings; it has never bounded the duty to fix what
    has actually been found (bot-found, on this rule's own PR: an earlier draft said "whatever it
    returns, file it and merge", which would have landed a regression introduced by the very fix
    the confirming review existed to check).

  That distinction is what keeps this terminating without lying about it. Out-of-scope gaps are
  finite because filing ends them; in-scope defects are finite because a fix that keeps
  introducing them is unsound. **An in-scope defect count that does not converge across
  confirming rounds is not a cap problem to route around** — it is the "escalating or clustering"
  bucket above, and the change wants rework or a narrower re-scope, not another patch.

  Skip the confirming review only when the substantive fix is empty — everything the closing
  review named was out of this PR's scope and got filed, so the head being merged is the one the
  closing review already covered.

Either branch terminates in a merge, on a head some review has actually seen. There is no
version of this rule where a green, mergeable PR sits waiting — on one more speculative review,
or on a human.

**Why the disposition is "track it and merge" rather than "hand it back"** (user decision,
2026-09-14, after SF-RC2/`#1409` sat green and idle through four monitoring check-ins under the
older wording): a substantive closing-review finding is nearly always a _scope_ signal, not a
quality one — the thing it names is real but belongs to a different story. Blocking the merge on
it stalls every queued story behind a PR whose own acceptance criteria are already met and
regression-locked, and it converts a schedulable gap into one that exists only in a PR thread.
Filing the issue is what makes deferring it honest; the merge is what keeps the milestone
moving. The issue goes on the **same milestone**, so it is queued rather than exiled, and is
parented to the epic when the gap is wider than the story that surfaced it.

This does not weaken anything above it. A finding inside this PR's own scope is still fixed
before merging, never filed instead. The merge criteria are unchanged: green CI on the current
head, `mergeable_state: "clean"`, confirmed review coverage, and no unresolved thread
representing an unaddressed _fixable_ finding — a disclosed-and-replied-to deferred gap backed
by a tracked issue is exactly the kind that may stay open.

Coverage in particular is not what gets traded away here, and the confirming review above is
what keeps that true (bot-found, on this rule's own PR — the first draft said "fix the in-scope
part and merge", which silently lands a head no review ever saw and contradicts the very
criteria this paragraph calls unchanged). The thing being given up is the _open-ended_ pursuit
of a zero-finding steady state, not the guarantee that the commit being merged was reviewed.

**Below the cap** — any review round before the 3-round auto-request limit is reached — if a
finding reveals a real gap wider than this PR's own scope (not a bug to fix in this diff, but a
missing structure or invariant a future story needs to build), the default move is to **file it
as a tracked sub-issue of the story** (`sub_issue_write`, parented to the issue this PR closes)
rather than only disclosing it on the PR thread per the rule above. A PR thread is read once and
then scrolls away; a tracked sub-issue survives to whichever future story actually needs it.
Also record it in that session's own handoff, under "Continuing the relay" — a sub-issue filed
but never mentioned in the handoff is easy for the next session to miss entirely.

**This now applies to the capped closing review too**, which is what its own "substantive ->
file it and merge" branch above means in practice: file first, then merge, so the deferral is
tracked before the PR that disclosed it stops being the place anyone is looking. (Superseded
here — an earlier version scoped this section to below-the-cap findings only, on the grounds
that filing is itself an automated action and a capped finding had to be _proposed_ to the user
instead. That branch no longer hands off, so the carve-out no longer has anything to protect.)

## Verify "CI is green" against live state, not the webhook event that announced it

A `check_suite.completed` webhook event can name a **stale** `head_sha` — this has happened
repeatedly, sometimes minutes after the real fix commit was already pushed. Before treating any
such event as a signal to merge: re-fetch the PR directly (`pull_request_read`/`get_check_runs`)
and compare against the PR's actual current head. Don't wait for a future webhook to confirm
it — if the current head's own completion event already arrived before this stale one showed
up, there may be no "next" event ever again, and waiting for one stalls a PR that's actually
already green. The live check you just ran is the ground truth; act on what it shows. Use
`get_check_runs`, not the legacy commit-status API — this repo's CI runs as GitHub Actions
checks, and the legacy API can report `total_count: 0` while checks are actively running.

`get_check_runs` on the correct head is necessary but **not sufficient**, and this is the one
place that distinction has actually cost something: a workflow run cancelled by its concurrency
group (which is what your own next push does to the previous run) contributes no check runs, so
its jobs are absent rather than red and the aggregate reads all-green. Before merging, verify
the run that matters by `head_sha` via `actions_list method=list_workflow_runs` — see the
cancelled-`Extension CI` entry under "Cold-start footguns" in `CLAUDE.md` for the full trap and
the exact call.

## Auto-merge, when the user has standing-authorized it for this repo

Standing authorization is scoped to the exact repo(s) it was granted for and must be restated
in every handoff, not assumed to persist silently — a grant for this repo does not imply
`paulgsc/server`, or vice versa. When it applies here: confirm CI is green on the _current_
head (per the freshness check above), confirm `mergeable_state: "clean"`, confirm bot-review
coverage on the current head is actually confirmed if this repo's reviewer doesn't auto-review
pushes — "no unresolved thread" is not the same as "reviewed," since a review requested but
not yet answered creates no thread at all. **Unlike `babysit/SKILL.md`'s stand-down criteria,
auto-merge does not get babysit's graceful timeout** — that timeout only licenses ending
active polling while leaving the PR for a human to merge; it never licenses merging a push
nobody has actually reviewed. If review coverage can't be confirmed, don't merge — fall back
to babysit's normal watch (and its own eventual stand-down) instead. Also confirm no
unresolved review thread represents an unaddressed _fixable_ finding
(a disclosed-and-replied-to deferred gap is fine to leave open), and confirm Claude Approvals is
passing or not required for this
repo — then merge (squash, matching this repo's existing history) without pausing to ask again.
After merging: verify the linked issue actually closed, not just that the PR shows merged, then
unsubscribe from PR activity and cancel any standing check-in trigger for it.

The tool-permission classifier idiom (a scheduling/cleanup call denied independent of
GitHub-side state — retry once or twice, try a closely related tool once) and the git hygiene
discipline (`diff --stat` before committing, fresh `fetch` before trusting a local ref, restart
a branch whose predecessor PR already merged) apply here too — see the "Cold-start footguns"
section of `CLAUDE.md`, which isn't PR-lifecycle-specific so it lives there instead of being
duplicated in this file.

## Cross-repo PRs: name every one, every time

When a story spans this repo and `paulgsc/server`, never write "landed the PR" — name both,
`owner/repo#number` each. A standing auto-merge (or any other standing) authorization for this
repo does not extend to the sibling repo by implication; ask before assuming it does.
