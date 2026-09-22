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

If the task requires regenerating the checked-in route snapshot, follow
`apps/servers/file_host/docs/route-inventory.md` in the server repo: apply the
`migrations/*.up.sql` files to a throwaway SQLite db (Python's built-in `sqlite3`
module works fine and avoids needing `sqlx-cli`), set `DATABASE_URL` to it, and run
`cargo run --bin dump-routes -p file_host` (add `-- --ts` for the TypeScript union).
Diff the output against the checked-in copies before replacing them — the diff should
be exactly the routes that changed, nothing else. Never hand-edit
`routes.server.json` or `routes.ts` to add a route; both are generated, and a
hand-written entry can silently drift from what the server actually serves.

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

- **A fresh clone has no prebuilt `dist/` — `pnpm install` alone isn't enough.** Build with
  `npx turbo run build --filter="www^..." --continue` (the `--continue` matters: without it,
  one unrelated package's build failure aborts the whole graph, and `tsc --noEmit` then
  reports a wall of `Cannot find module '@some-ui/...'` errors that look real but just mean
  "never built"). Scope `tsc`/`vitest` to the package you're in (`pnpm --filter <pkg> exec
tsc --noEmit`, `pnpm exec vitest run <path>`), not the repo root.
- **`@some-ui/resume` is the package that fails that graph build, and neither of its two
  failures is an environment gap to route around — both are fixable here in about a minute.**
  It is the only package whose build downloads a pinned `typst` plus nine font files and then
  validates the _rendered PDFs_ with Poppler's `pdftotext`, so it trips over two things
  nothing else in the repo touches. (1) `turbo` runs tasks in strict env mode, which stripped
  `NODE_EXTRA_CA_CERTS` — this sandbox's proxy CA bundle — so every download failed TLS under
  `turbo` while the byte-identical `fetch` succeeded when run directly. Fixed in `turbo.json`
  via `globalPassThroughEnv` (which also carries `PDFTOTEXT_BIN`, the escape hatch the check
  scripts document and strict mode was likewise eating). If it resurfaces the tell is
  `[resume] fetch failed: self-signed certificate in certificate chain` — check the URL with
  `curl` (which does honour the proxy env) before believing the network is blocked. (2)
  `pdftotext` genuinely is absent, but it is one command away:
  `apt-get update -qq && apt-get install -y --no-install-recommends poppler-utils`. The
  script's own error names `poppler-utils`; it also names the repo's nix shell, which does
  not exist in this sandbox — ignore that half rather than concluding the whole remedy is
  unavailable. Until both hold, `--continue` masks the damage instead of avoiding it:
  `www:build` still fails outright on `Rolldown failed to resolve import "@some-ui/resume"`,
  and a `www` build that does get through ships a `/resume` route whose download and desktop
  preview 404 (`[www] documents/manifest.json not found`). A graph build ending
  `Failed: @some-ui/resume#build, www#build` is the expected outcome of following the bullet
  above _without_ these two — it is not pre-existing breakage to note and step around, and
  "not my change" is the wrong call on it.
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
