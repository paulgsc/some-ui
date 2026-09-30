# CLAUDE.md

## Pre-commit verification (Claude Code Remote)

`.husky/pre-commit` skips its `lint-staged` step when `CLAUDE_CODE_REMOTE=true` — for a
commit spanning many workspaces, running per-package `eslint`, `tsc --noEmit`, and
`prettier` there routinely exceeds this sandbox's command timeout, which hangs the
commit rather than failing it cleanly. `commit-msg` (commitlint) still runs regardless.

Because that safety net is off in this environment, **before every commit** you must
manually run the equivalent of what `lint-staged.config.js` would have run over your
staged changes, and treat a failure the same way you would a failed hook — fix it, don't
commit past it:

- `eslint --fix` (or at minimum a clean `eslint`) for every touched package
- `tsc --noEmit` (project-aware typecheck) for every touched package
- `prettier --check` (or `--write`) over touched files
- `stylelint --allow-empty-input` over any touched `**/*.css` files

Skipping this because the hook stayed quiet is not an option — the hook staying quiet in
this environment is expected, not a sign that everything is clean.

## Cross-repo coupling with `paulgsc/server`

`some-ui` and `paulgsc/server` are tightly coupled through `packages/contract-harness`
(hand-written contracts checked against `packages/contract-harness/routes.server.json`)
and `packages/server-routes/src/generated/routes.ts` — both are copies of an artifact
`paulgsc/server` generates about itself, not files this repo owns the content of.

When a task references a server-side PR/commit, or touches anything those two files
describe (routes, request/response shapes for an endpoint, `/presence`, `/signals`,
`/push/*`, etc.), clone `paulgsc/server` read-only (`add_repo` with `access: "read"`,
then a shallow `git clone`) instead of inferring server behavior from the client repo
alone or from memory. Read the actual route/handler source at the commit the task
names — it is more reliable than any paraphrase, including this one.

The snapshot normally arrives on its own: every merge to the server's `main` opens (or
updates) a PR here on `bot/server-route-snapshot`, and every server PR is checked against
this repo's contracts before it merges (server `.github/workflows/routes.yml`). Both go
through `scripts/sync-server-routes.sh`, which is the one thing that writes these two
files — if they move, update that script and nothing in the server repo. That server job
is the bot PR's only writer; `.github/workflows/server-route-snapshot.yml` just re-runs it
when this repo's snapshot files change on `main`, or on a `/resync` comment on the bot PR,
so a PR whose snapshot already reached `main` another way closes itself.

> **RS1: the resync workflow only reads and dispatches.**
>
> - _Claim:_ `server-route-snapshot.yml` never writes the `bot/server-route-snapshot`
>   branch or its PR; it reads, reacts to the comment, and dispatches paulgsc/server's
>   `routes.yml`, whose `sync` job is the PR's writer.
> - _Falsified by_ any hunk after which `server-route-snapshot.yml` holds anything outside
>   this closed list, checked against the whole file as it stands after the diff:
>
>   - its `run:` scripts call no `gh`, `git`, `curl` or `wget` except `gh pr view` (a
>     read), `gh api` on `…/issues/comments/…/reactions` (the 👀), and exactly one
>     `gh workflow run routes.yml --repo paulgsc/server --ref main`;
>   - it has no `uses:` step;
>   - its permissions are only `issues: write` and `pull-requests: read`.
>
>   So adding a network call, a second dispatch or an action falsifies RS1, and so does
>   deleting or changing the one dispatch, whatever replaces it. The list is closed
>   because what an unlisted command would write cannot be judged from the hunk.
>
> - _Scope:_ `.github/workflows/server-route-snapshot.yml`.
> - _Why not enforced:_ no lint, type or test here looks inside workflow YAML, and
>   `actionlint` does not check what a step may call. Comparing the file against the list
>   is mechanical ("mechanical; not yet a rule").
>
> True when declared: the file matches the list exactly (those three `gh` calls, no
> `uses:` step, and only `issues: write` and `pull-requests: read` under a top-level
> `permissions: {}`).
>
> **RS2: nothing else in this repository writes the route snapshot PR** (not reviewable).
> Any workflow's action or script could push that branch without naming it, so no hunk
> can settle it, and a reviewer should not flag or clear a diff on it. What can be
> checked mechanically is the narrow case: no workflow other than
> `server-route-snapshot.yml` names `bot/server-route-snapshot`. That grep is the
> tracked debt; it belongs in the planned CI check that also enforces artifact
> retention. True when declared: no other workflow names the branch.

If you need a snapshot the bot hasn't delivered yet, follow
`apps/servers/file_host/docs/route-inventory.md` in the server repo: apply the
`migrations/*.up.sql` files to a throwaway SQLite db (Python's built-in `sqlite3`
module works fine and avoids needing `sqlx-cli`), set `DATABASE_URL` to it, run
`cargo run --bin dump-routes -p file_host` into one file and `-- --ts` into another,
then pass both to `scripts/sync-server-routes.sh <json> <ts> --verify`. The diff it
prints should be exactly the routes that changed, nothing else. Never hand-edit
`routes.server.json` or `routes.ts` to add a route; both are generated, and a
hand-written entry can silently drift from what the server actually serves.

## Test layout

A source directory keeps **at most one** `*.test.*` file. A second one means all of that
directory's tests live in `<dir>/__tests__/`, with basenames unchanged. The generated
TanStack routing tree (`src/routes/**`) keeps **none** outside `__tests__/`. Dedicated test
trees named `__tests__/` or `tests/` (`packages/eslint/tests`,
`packages/some-styles/styles-build/tests`) are exempt from the one-per-directory limit.

This is enforced, not advisory: `pnpm check:test-layout` (`scripts/check-test-layout.ts`,
rule in `packages/eslint/src/test-layout.ts`) fails the PR workflow and root `pnpm lint`
(#772, #1475). Colocating a second test beside the file you're editing is the easy path,
and it fails that check. The check is deliberately not an ESLint rule: `eslint --cache`
re-uses a file's result until the file itself changes, so a sibling-dependent verdict
goes stale. When moving tests, prefer the package's path alias over `../`, which most
workspaces ban. Watch any test that derives a directory from `import.meta.url` to scan it:
it now sits one level deeper and can pass having scanned nothing.

## Gray-area invariants: declare them falsifiable

Some rules this codebase depends on cannot be enforced by a lint rule, a type, or a test.
When you rely on one, **declare it as a falsifiable invariant** rather than leaving it as advice.
Then a reviewer, human or bot (`REVIEW.md`; `AGENTS.md` repeats the rule for Codex), can settle each diff with a single
yes/no check against the invariant. Advice like "be careful to…" leaves them exploring every
state the code could reach.

**Only for defensible gaps.** An invariant is not a substitute for a check. Before declaring
one, rule out each mechanism and say why it fails: lint (the fact is not at the call site,
or widening the rule would flag correct code), types, and tests (the state space is
open-ended, or only a real browser shows it). If something _could_ be enforced
mechanically, enforce it instead. If it is enforceable but not yet enforced, it may be
declared, but labelled **"mechanical; not yet a rule"** so it reads as debt, not as a
permanent gap.

**Shape.** Every invariant has an ID and all four parts:

- **Claim** — one sentence about code, over a named scope ("in a class that owns an
  `ActiveScope`, every `.interval(` … acquires on the scope `start` receives").
- **Falsified by** — what in a _single hunk_ contradicts the claim, checkable from the hunk,
  the file it changes (as it stands after the diff), and at most files the invariant names.
  The changed file is allowed because a hunk shows only a few lines of context, and what a
  claim relates may sit further apart than that; anything beyond it must be named. If you
  can't write this line, you have advice, not an invariant. It must cover **every kind of edit that can make the claim false**, not
  only additions: a hunk that deletes, renames or moves the thing the claim relies on
  breaks it as surely as one that adds a violation. Since a reviewer stops when the
  falsifier doesn't match, a regression the falsifier misses goes unreported.
- **Scope** — the paths or workspaces it covers, and any stated exceptions.
- **Why not enforced** — which of lint, types and tests fails here, and why.

Something that no diff can falsify (CI wiring, say) is still listed, marked **"not
reviewable"**, with where it is tracked, so a reviewer knows not to flag it.

**True when it lands.** Check every claim against the code in the same change that declares it.
If one doesn't hold, fix the code or narrow the claim. A declared invariant must describe the
code as it is, so any later violation is a regression, not old debt. Say how you checked it,
for example "all 12 exemptions conform".

**Placement.** Put the full set in the doc that owns the idiom. Put a one-line-per-ID summary in
the doc comment of the module it governs, so a reviewer reading the hunk finds it. IDs are
stable: never renumber; retire one by marking it retired with a reason. The first full set is
the resource-lifetime invariants L1–L8 in `extensions/common/GOOD_CITIZEN.md` → "Resource
lifetimes: what is enforced, and what is not"; `extensions/common/src/lib/lifetime/index.ts`
carries their one-line summaries.

A worked example, quoted from that set (`GOOD_CITIZEN.md` is the authoritative copy; all 12
exemptions conform on `main`):

> **L3: An exemption names what ends the resource.**
>
> - _Claim:_ every `eslint-disable` of `require-named-lifetime` or `require-scoped-lifetime`
>   has a line starting `Lifetime:` in the unbroken `//` comment block directly above it,
>   saying what ends the resource.
> - _Falsified by_ a hunk that adds such a directive without that line, that deletes or
>   rewords the `Lifetime:` line above an existing directive, or that breaks the comment
>   block between them (inserting a non-comment line).
> - _Scope:_ the whole repo.
> - _Why not enforced:_ whether the `Lifetime:` line is true needs a person to read it.
>   Whether it exists is mechanical ("mechanical; not yet a rule").

**Per-site tags: state the fact where the code hides it.** When a claim is about many sites
rather than one rule, as L3's `Lifetime:` line is, the invariant can govern a tagged comment
at each site that names its ID. `Cost (LP3):` in `extensions/some-drama/README.md` → "Live
playback" does this for costs. A reviewer then checks a hunk against the tag right above it
instead of re-deriving the fact. Write a tag only where a reviewer reading that one function
couldn't see the fact: it sits in a callee, a closure, a multiplier across tabs or instances,
or a bound kept by code elsewhere. Where the body shows it (one visible loop, O(1)
arithmetic), leave the tag out: it adds nothing to review and is one more claim to keep true.
The invariant defines the tag's terms (for costs, the variables) and makes deleting a tag
whose code remains part of its falsifier.

## Cold-start footguns worth not re-discovering

These bite during ordinary implementation work, **before any PR exists** — read this at the
start of a session, not only once you're driving a PR's CI/review cycle (that part is
`.claude/skills/steward/SKILL.md`, which only fires once a PR is open).

This section — and `steward/SKILL.md` and `babysit/SKILL.md` — is living, not archival. A
future session may add a footgun once it's actually recurred or bitten, and may remove one
that turns out to be stale, wrong, or not worth the bloat it costs every session that reads
this file. Hold every change to the bar the current entries meet: recurs across more than
one session, or is a single incident with a silent failure mode and a near-free guard —
never "sounds like good practice."

- **A fresh clone has no prebuilt `dist/` — `pnpm install` alone isn't enough.** Through
  turbo this is handled: `typecheck` and `lint:js` declare `dependsOn: ["^build"]` (and
  `lint:js` also `@some-ui/eslint-kit#build`, which most `eslint.config.js` files import without
  declaring it), so `npx turbo run typecheck --filter=<pkg>` builds what it needs first
  (#1454). Anything run _outside_ turbo — `pnpm --filter <pkg> exec tsc --noEmit`, `vitest`,
  an extension's e2e — still needs the dependencies built: `npx turbo run build
--filter="www^..." --continue` (the `--continue` matters: without it, one unrelated package's
  build failure aborts the whole graph, and `tsc --noEmit` then reports a wall of `Cannot find
  module '@some-ui/...'` errors that look real but just mean "never built"). Scope
  `tsc`/`vitest` to the package you're in (`pnpm exec vitest run <path>`), not the repo root.
- **`@some-ui/resume` is the package that fails that graph build, and neither of its two
  host-tool gaps is one to route around — both are fixable here in about a minute.**
  It is the only package whose build downloads a pinned `typst` plus nine font files and then
  validates the _rendered PDFs_ with Poppler's `pdftotext`, so it trips over two things
  nothing else in the repo touches. (1) `turbo` runs tasks in strict env mode, which stripped
  `NODE_EXTRA_CA_CERTS` — this sandbox's proxy CA bundle — so every download failed TLS under
  `turbo` while the byte-identical `fetch` succeeded when run directly. Fixed in `turbo.json`
  via `globalPassThroughEnv` (which also carries `PDFTOTEXT_BIN`, the escape hatch the check
  scripts document and strict mode was likewise eating). If it resurfaces the tell is
  `self-signed certificate in certificate chain (SELF_SIGNED_CERT_IN_CHAIN)` at the end of a
  `[resume] Failed to download <url>: fetch failed <- ...` line — check that URL with
  `curl` (which does honour the proxy env) before believing the network is blocked. (2)
  `pdftotext` genuinely is absent. Since #1452 that no longer fails the build: a local build
  without it prints `[resume] WARNING: ... Skipping check-ats.mjs and check-layout.mjs` and
  completes (with `CI` set it fails instead). Install it anyway whenever you touch anything
  the résumé renders — the warning means the two checks that catch dropped terms and
  colliding lines did not run, and CI is then the first thing to run them. It is one command:
  `apt-get update -qq && apt-get install -y --no-install-recommends poppler-utils`. The
  warning names `poppler-utils`; the README also names the repo's nix shell, which does not
  exist in this sandbox — ignore that half. Until (1) holds, `--continue` masks the damage
  instead of avoiding it: `www:build` still fails outright on
  `Rolldown failed to resolve import "@some-ui/resume"`. A graph build ending
  `Failed: @some-ui/resume#build, www#build`
  is the expected outcome of following the bullet above without it — it is not pre-existing
  breakage to note and step around, and "not my change" is the wrong call on it.
- **A tool call can be denied by this environment's permission classifier independent of
  whether the action itself is valid.** Scheduling and cleanup calls in particular
  (`send_later`/`create_trigger`, `unsubscribe_pr_activity`, `delete_trigger`) have each been
  denied in some sessions and succeeded immediately in others — no call is reliably
  always-blocked or always-unblocked. Retry a denied call at most once or twice; if a closely
  related tool does functionally the same thing, try that once before concluding the
  capability is unavailable this session. If a blocked call actually matters, say so rather
  than silently working around it.
- **Before your first commit on a designated branch, check whether that branch's most recent
  PR already merged.** If so, restart the branch from a freshly fetched default branch
  (`git fetch origin main && git checkout -B <branch> origin/main`) before adding new
  commits — never stack new work on already-merged history. Fetch fresh; a stale local
  `origin/main` ref produces false alarms in both directions.
- **`STORYBOOK_WORKSPACE` is a directory name, not a package name.** It is globbed
  straight into `../packages/ui/<value>/**/*.stories.*`, so it wants `topik`, not
  `@some-ui/topik` — and getting it wrong does not fail. The build succeeds with only
  the six always-included design-system stories, and every ui-fit sweep then passes in
  about a second having measured nothing you cared about. Check the count before
  believing a fast green run:
  `python3 -c "import json; print(len(json.load(open('storybook-static/index.json'))['entries']))"`.
- **A green ui-fit run proves only what is in the viewport matrix.** It is four sizes in
  `apps/www/tests/ui-fit/harness.ts`, one of which (780×390) exists because the other
  three are all portrait or landscape-desktop, and a phone held sideways was therefore a
  shape nothing could fail on. If a report is about an orientation or window shape, check
  that matrix contains it before concluding the surface is fine.
- **Run `git diff --cached --stat` before every commit, not only `git status`.** Run it
  after staging (`git add`) — plain `git diff --stat` only shows the unstaged worktree, so
  it can miss binary corruption in content that's already staged and about to be committed.
  A `Bin ... -> ... bytes` line on a file you expect to be text source is the tell for
  embedded-NUL or other binary corruption that no lint, typecheck, or test will catch.
- **The `some-censor` e2e suite needs an env var whose absence sends you somewhere that does
  not exist here.** Without it every spec fails in ~3 ms with `[BOYO]
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set`, and the error's own remedy is "enter the
  playwright nix shell: `nix develop .#playwright`" — which is not available in this sandbox, so
  following it is a dead end. The browser is already installed; point at it:
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (check the directory first — `-1194` is a Playwright revision and will change). Also never run
  `playwright test` directly for this package: `test:e2e` also runs
  `node scripts/patch-test-manifest.mjs`, which adds `file://*/*` to `content_scripts.matches`,
  and skipping it fails 8 of 9 specs with `__BOYO_DEBUG__` null — which reads exactly like a
  real regression in the extension rather than a missing build step.
- **`bash scripts/claude-e2e.sh` (any `some-filter` e2e run) silently resolves the wrong
  `playwright` binary in this environment.** `which playwright` finds a global install
  (`/opt/node22/bin/playwright`, a different version than this workspace's own pinned
  `@playwright/test`) before the workspace's own `node_modules/.bin/playwright` — the
  script's own `exec playwright test "$@"` has no reason to prefer one over the other, and
  PATH order picks the global one. The result is `Error: Playwright Test did not expect
test.describe() to be called here`, thrown from the _first_ `test.describe()` in whichever
  spec runs first — reads exactly like a real code/config bug (and the error's own listed
  causes don't mention PATH at all), for every spec in the suite, not just a new one you just
  added. Prepend the workspace root before invoking: `PATH="$(git rev-parse
--show-toplevel)/node_modules/.bin:$PATH" bash extensions/some-filter/scripts/claude-e2e.sh
<args>`.
- **Driving a `storybook build` output with Playwright over a bare `file://` URL silently
  renders nothing.** The built preview loads its bundle as ES modules, and Chromium enforces
  CORS on `file://` script/stylesheet requests — every asset fails with "Access to script...
  has been blocked by CORS policy... Cross origin requests are only supported for protocol
  schemes: chrome, ... http, https", the page body stays empty, and a query like `page.locator(
'[aria-label="..."]').count()` just comes back `0` with no exception thrown — reads exactly
  like the component isn't rendering what you think it renders, not like a transport problem.
  Serve the build over a local HTTP server first (`python3 -m http.server <port>` from the
  `storybook-static` dir, backgrounded) and point Playwright at `http://localhost:<port>/...`
  instead of the `file://` path.
- **A cancelled `Extension CI` run reads as a fully green PR — including from
  `get_check_runs` on the correct head.** Your own next push cancels the in-flight run for the
  same PR via its concurrency group, and a cancelled run contributes **no check runs at all**.
  So `Verify some-filter` — the only job that builds this extension and runs its tests in CI —
  is not missing-and-red, it is simply absent, and every aggregate signal reports success.
  Seen simultaneously on one head: `get_check_runs` → 14 checks, all `success`;
  `mergeable_state` → `clean`; and a `check_suite.completed` webhook saying no suite was still
  running or failed. All three agreed, and the extension had been verified by nothing. (The
  webhook does disclose it — "Cancelled suites, suites with no runs ... are not covered" — it
  is just easy to skim past.) It is worth a line here rather than only in `steward/SKILL.md`
  because the misleading part is the _generic_ check every session reaches for first. Before
  merging, verify the workflow run itself by `head_sha` — `actions_list` with
  `method=list_workflow_runs`, `resource_id=extension.yml` and a branch filter — and require a
  run whose `head_sha` matches your head with `status: completed` **and**
  `conclusion: success`. Distinguish the two ways that run can be _absent_, because only one is
  a problem: a run for your head with `conclusion: cancelled` means nothing was verified and you
  must wait for the re-run, whereas no run at all on a diff outside the workflow's path filter
  (a docs-only PR, say — `changes / Detect Changed Paths` succeeds and the downstream jobs
  report `skipped`) is correct and not something to wait for. `extension.yml`'s own `on:` block
  is the authoritative filter list. Related: a job can sit `in_progress` for ~10min in a
  `Post Run .../nix-setup` teardown step long after every substantive step passed;
  `list_workflow_jobs` shows step-level state, but still wait for the job itself to complete,
  since a post-step failure can mark it red.

## Multi-session relay work

Some stories in this repo span many sessions, each picking up from a self-contained handoff
document the previous session wrote — a new session has no memory of prior conversation and
must be able to work from the handoff alone. If you're continuing one, re-read the live
issue/PR it describes before trusting its summary; it may have moved on since the handoff
was written. A footgun that recurs across more than one handoff belongs promoted into this
file instead of left for whichever future session happens to receive that specific handoff —
that's what the section above is.

If you're leaving unfinished multi-session work: write the next handoff from
`.claude/skills/steward/handoff-template.md` and deliver it to the user directly (e.g. via
`SendUserFile`) rather than committing it.

See `.claude/skills/steward/SKILL.md` for how to drive an already-open PR (auto-merge
mechanics, bot-review handling, the re-review-request idiom) and
`.claude/skills/babysit/SKILL.md` for the separate polling-cadence policy — both are
consulted automatically when acting on CI or review events, not just on request.
