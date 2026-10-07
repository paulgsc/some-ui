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
> - _Falsified by_ any change to `.github/workflows/server-route-snapshot.yml` other than
>   adding, removing or editing full-line `#` comments or blank lines outside `run:`
>   blocks and other multi-line scalars (`key: |`, `key: >-`, a quoted string spanning
>   lines: inside one, a `#` line is part of the value and can be data). That includes
>   deleting, renaming or moving the file, which a pure rename shows with no hunk at all.
>   Every other line can change what runs or with what authority, and what a change can
>   reach cannot be judged from a hunk, so each such change is a finding for a person to
>   re-check against the claim. The exemption is closed: a YAML comment line is the only
>   edit that cannot execute.
> - _Scope:_ `.github/workflows/server-route-snapshot.yml`.
> - _Why not enforced:_ no lint, type or test here can tell what a workflow change writes,
>   so whether the claim still holds needs a person. That the file changed is enforced:
>   `pnpm check:workflows` (below, "Workflow storage") hashes its raw bytes and fails
>   until `RS1_FINGERPRINT` in `packages/eslint/src/workflow-guards.ts` matches, so every
>   edit, a deletion, rename or move included, must bump the pin in the same change. A
>   diff that bumps it is where this falsifier is applied: comment lines only need no
>   re-check, anything else does. The check does not try to tell those apart itself:
>   that is YAML parsing, and each lexical attempt on #1604 missed a shape.
>
> True when declared: the scripts' only calls that reach GitHub are one `gh pr view`
> (a read), one `gh api` adding a reaction, and one
> `gh workflow run routes.yml --repo paulgsc/server --ref main`; the rest is shell built-ins
> (`set`, `if`, `[`, `exit`, one assignment) and `echo` to the log, `$GITHUB_OUTPUT` and
> `$GITHUB_STEP_SUMMARY`.
> There is no `uses:` step, and the only permissions are
> `issues: write` and `pull-requests: read` under a top-level `permissions: {}`.
>
> **RS2: nothing else in this repository writes the route snapshot PR** (not reviewable).
> Any workflow's action or script could push that branch without naming it, so no hunk
> can settle it, and a reviewer should not flag or clear a diff on it. What can be
> checked mechanically is the narrow case: no workflow other than
> `server-route-snapshot.yml` names `bot/server-route-snapshot`. `pnpm check:workflows`
> enforces that over every workflow and composite action (`.github/actions/**`), comment
> lines included. True when declared: no other workflow names the branch.

If you need a snapshot the bot hasn't delivered yet, follow
`apps/servers/file_host/docs/route-inventory.md` in the server repo: apply the
`migrations/*.up.sql` files to a throwaway SQLite db (Python's built-in `sqlite3`
module works fine and avoids needing `sqlx-cli`), set `DATABASE_URL` to it, run
`cargo run --bin dump-routes -p file_host` into one file and `-- --ts` into another,
then pass both to `scripts/sync-server-routes.sh <json> <ts> --verify`. The diff it
prints should be exactly the routes that changed, nothing else. Never hand-edit
`routes.server.json` or `routes.ts` to add a route; both are generated, and a
hand-written entry can silently drift from what the server actually serves.

## Workflow storage

Everything a workflow stores costs GitHub space for as long as it lives, so the default is
the shortest life that works, and nothing recreated leaves its old copy behind.

- **Artifacts live one day.** Every `actions/upload-artifact` and
  `actions/upload-pages-artifact` step sets `retention-days: 1`. Anything else is written
  as an explicit number with a `Retention:` line in the unbroken `#` comment block
  directly above the step, saying who reads the artifact after that day and why that
  path is one we want taken. A step with no `retention-days` fails either way: the repo
  default (90 days) is not a period anyone chose. So does a value that is not a literal
  number of days (`0`, empty, a `${{ }}` expression), since each can resolve to that
  default. Two artifacts keep longer today, both in `mobile-apk.yml`: the phone's APK
  (30 days, pruned to one) and the Play review's inputs (3 days). Artifacts cannot be
  overwritten across runs, so a short `retention-days` is how a recreated one leaves no tail.
- **Enforced by `pnpm check:workflows`** (`scripts/check-workflows.ts`, rules in
  `packages/eslint/src/workflow-guards.ts`), in root `pnpm lint` and as its own `pr.yml`
  job that CI Gate requires. The same script carries RS1's fingerprint and RS2's grep
  (above). It reads the value only as a direct child of the step's block-style `with:`
  map, where the action gets it; anywhere else it does not count, and a flow-style
  `with: {...}` or `- {uses: ...}` step fails as unreadable. It finds steps by their `uses:` line, so an upload
  wrapped in a composite action or another publisher's upload action is not seen: add
  it to the rule when one appears.
- **Before shortening something to one day, name the path that breaks and its
  recovery** in the comment above the step. The usual one is "Re-run failed jobs" more
  than a day later, which finds no artifact: the recovery is a fresh run or the
  workflow's own `publish_only` dispatch, since re-running a day-old publish would ship a
  day-old build anyway.
- **What stays, and why** (not artifacts, so no `retention-days` applies):
  - Actions caches (`pnpm-cache`, `cargo-cache`, `resume-assets-cache`, the
    workspace-dist cache, the Docker `type=gha` layer cache in
    `www-docker-release.yml`): GitHub evicts an entry unused for 7 days and caps the
    repo at 10 GB. Keys that change with their inputs churn that cap but cannot grow
    past it.
  - The Pages deployment, npm packages, AMO submissions and the `paulgsc/www` Docker Hub
    image are the point of their workflows and are meant to last. Nothing prunes old
    Docker Hub tags; that is Docker Hub's storage, not this repo's.
  - Bot branches (`release/pages`, `changeset-release/*`, `bot/server-route-snapshot`)
    are opened with `create-pull-request`'s `delete-branch: true`, so each deletes itself
    once `main` carries its content.
- **Repo setting, not code:** Settings → Actions → General → "Artifact and log
  retention" sets the default for any upload without `retention-days` and caps any
  explicit value above it. It also sets how long run logs are kept.

## Desktop follows the APK

The APK is the product. The desktop experience is being rebuilt to mirror it,
so desktop-only UI is going to churn. Before polishing, migrating or fixing UI,
check which surface renders it: work on APK and platform-agnostic UI is
worthwhile, and work on desktop-only UI is usually wasted. Phone and desktop
split in a few places: `useIsMobile` in `Leetype` (`RoundSession` under 768px
wide, the typing game above), `chooseSurface` in topik (`HandheldLesson` under
768px wide or 480px tall, `DesktopSession` otherwise), the `lan` audience (not
in the APK build), and the `_apk` routes. The window-size splits follow the
window, not the device, so the APK on a tablet gets the wide surfaces too. When a repo-wide sweep has to skip a desktop-only file, say so
where the skip lives, as the `paletteRatchet` calls do.

## Vestiges

A workspace earns its place only while something live points to it: an app, a shipped
extension, a document build, or an activity in `@some-ui/activity-catalog`. A skeleton
kept for a story "we'll come back to" does not. New code is cheap here and the
conventions keep moving, so a skeleton goes stale anyway (no current lint config, no
knip, thin tests), and the chance of returning to it falls with every day its own code
goes untouched. Git history keeps what is deleted.

`pnpm report:vestiges` (`scripts/report-vestiges.ts`, rule and tests in
`packages/eslint/src/vestiges.ts`) ranks the candidates. Run it near the start of any
session that plans cleanup, or before adding to a workspace whose last activity you don't
know. It needs full history (`git fetch --unshallow`); in a shallow clone it warns, and every
date is clipped. A workspace is a candidate when it is:

- **unreached:** no deployable depends on it, directly or through another workspace; or
- **stale and drifting:** its own source has not changed in 60 days, it is missing a script
  live workspaces carry (`lint`, `typecheck`, `test`, `knip`) or has no tests, and it is not a
  shared library (more than two dependents).

"Own change" ignores tests, manifests and config, file deletions (cleanup is not work on the
story), and sweeps across more than eight workspaces (version bumps, renames, rollouts).

It is a report, never a gate: whether a story is dead is the owner's call, so put the
candidates to them instead of deleting on the score alone. Known false positives come from
what `package.json` cannot show. `packages/some-content` is consumed by file path (its
`public/` assets), not by package name. A registry key reaches a package only if something
can still bind it, so check `componentRegistry` and the activity catalog before calling a
reached package live.

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

## Deleting is in scope

Removing code, tests and docs that your change made unreachable or redundant is part of the
change, not widening it, whatever generic "keep the diff minimal" guidance says. Before
adding a module, component, hook or helper, search `packages/ui/shared`, `packages/core-utils`,
`packages/react-hooks` and the sibling workspaces for one that already does the job, then reuse or generalize it.
When yours replaces something, remove the old one and its tests in the same PR. When a
behavior changes, edit its existing test rather than adding another beside it.

Every PR opened from the template (`.github/pull_request_template.md`), by a person or an
agent, has a **Superseded** section. It says what the change made obsolete and removed, or
"None" and why. A second implementation without that is a blocking review finding
(`REVIEW.md`, "Second implementations and code left behind"). PRs a workflow opens with a
fixed body (Changesets, the Pages and Docker release PRs, extension releases, the route
snapshot) are exempt: they carry generated content, not new implementations.

## React is not the coordinator

When a feature holds anything external with an async lifetime (a microphone, an `Audio`, a
socket, IndexedDB, a request whose late result can land over a newer one), write its state
union and pure `step` in `lib/` first, then a runtime over ports that owns the handles and
decides which result is stale, and only then the component, which reads a snapshot and
dispatches events. `docs/monorepo-boundaries.md` → "Inside a React package: the component
is not the coordinator" has the shape, the model to copy (topik's `core/`) and invariant R1.
`packages/ui/lesson-crm`'s turn counters in refs are grandfathered debt, not precedent: do
not match that surrounding code.

Enforced as a count, not a verdict: `pnpm check:react-coordination` (root `pnpm lint`, and a
pr.yml job CI Gate requires) fails when a React module, component or hook, has more or fewer
`await`/`.then`/`.catch`/`.finally` sites than `scripts/react-coordination.allowlist` says. An
entry is allowed when the reason is real: put it in its own group under
`# Coordination: <the external work, and why it cannot live outside React>`, never in the
grandfathered group. If the only honest reason is "it needs an await", the code belongs in the
runtime instead.

A port to anything we do not own (a native plugin, `navigator`, `Notification`) waits through
`callForeign` (`@some-ui/intent-kit`), never its own failure union or timeout; `unavailable` means
withdraw the control. `pnpm check:foreign-boundary` counts bare waits as R1 does (F1).

A component or hook that seeds `useState`/`useReducer` from its own prop or from the clock keeps
a copy frozen at mount while the owner moves on; #1659's review found that five times, one per
round. `owner-guard/no-mount-snapshot` (eslint-kit's opt-in `ownerGuardConfig`, on in aph,
soundbites and www) reports it. Derive the value where it is used, name a read-once prop
`initial*`, or disable the line with the reason (an edit buffer keyed by what it edits, a runtime
made once per mount). The aph store also refuses a write that rewrites what was already logged
(`breaches` in its model), since a stale reference leaves a valid state that no lint can see.

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
- **A green ui-fit run proves only what is in the viewport matrix.** It is four sizes in
  `apps/www/tests/ui-fit/harness.ts`, one of which (780×390) exists because the other
  three are all portrait or landscape-desktop, and a phone held sideways was therefore a
  shape nothing could fail on. If a report is about an orientation or window shape, check
  that matrix contains it before concluding the surface is fine.
- **A Capacitor plugin object is a thenable: never resolve a promise with one.** Its Proxy
  answers `then` too, so `return SpeechRecognition` from an `async` function waits forever,
  silently. Box it (`return { plugin }`), and mock plugins as a Proxy that answers every key
  (`asCapacitorPlugin` in `apps/www/src/lib/dictation/index.test.ts`), or the test passes anyway.
- **A `console.error` in www is gone from release builds** (`build.minify.ts`), and the APK's
  console reaches nothing anyway. Report failures through `reportFailure` (`@some-ui/intent-kit`),
  which survives both: `adb logcat -s SomeUI`.
- **Nothing on a PR builds or launches the Android app.** `mobile-apk.yml` (Gradle
  compile, R8 release build, Android Lint, the Play review, and an emulator launch test)
  runs only on pushes to `main`, so a Java error in `apps/mobile/android`, an R8 break or a
  Lint error (the review gates on errors, `lint.gate` in `apps/mobile/review/policy.json`;
  warnings stay report-only) first appears after merge, on a green PR. Build it here before
  pushing any change under `apps/mobile/android`: dl.google.com is reachable, so unzip
  Google's `commandlinetools` into the scratchpad, `sdkmanager --sdk_root=<dir>
"platforms;android-36" "build-tools;36.0.0"`, then `pnpm exec cap sync android` from
  `apps/mobile` (it generates the gitignored `capacitor-cordova-android-plugins/`, without
  which Gradle fails to configure) and `ANDROID_HOME=<dir> ./gradlew :app:lintRelease
:app:assembleRelease`. Maven Central can answer 429 mid-download; that is rate limiting,
  so retry. Separately, vitest and every www Playwright suite run the `lan` or `pages`
  build profile, never `mobile`: `MOBILE_APP` and `hasAudience("apk")` are false there, so
  an APK-only branch (the bottom bar, the header's Home link) is rendered by no test unless
  that test mocks `@/lib/build-profile` itself. `main`'s launch test does start the APK and
  drive it with a monkey (`apps/mobile/launch/launch-test.sh`), but with `--pct-syskeys 0`:
  it never presses back, so the back handling in `MainActivity` (the app has no
  `@capacitor/app`) is reached by no test at all.
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
mechanics, bot-review handling, review coverage on every head) and
`.claude/skills/babysit/SKILL.md` for the separate polling-cadence policy — both are
consulted automatically when acting on CI or review events, not just on request.
