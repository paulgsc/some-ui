# CLAUDE.md

## What this repository is: two mandates

Read this first. It answers the product questions the rest of this file doesn't.

This is one person's working toolkit (studying, tracking, making, watching) run as real
software, and every surface in it answers to two mandates at once:

- **A: it works.** Build applications that materially achieve their goal in the owner's own
  workflow. This is the owner's working mind on a screen, used every day.
- **B: it reads.** Make each of them legible as an artifact any third party can take in,
  read-only, at whatever level of sophistication they bring: an organic snapshot of real,
  live work, shown as it happens.

There are two users:

- **The owner:** the only one who signs in and the only one ever online. Uses, maintains
  and consumes all of it.
- **The viewer** (the owner's word is "voyeur"): anyone else. Observes, read-only, and
  never sees the owner's data. The aim is that they understand what they see.

What follows from them:

- **Published by default.** The code is public, and the apps ship through public channels:
  Pages, AMO and YouTube today. The APK is sideloaded today and headed for Google Play as a
  free personal hobby app. "For me" names the audience; exposure is a separate question.
  Keep every public channel and its upkeep (the APK's Play readiness in
  `apps/mobile/README.md`, say) even when only the owner uses the thing.
- **Private only where the data is personal.** What serves A and holds PII stays on the
  home network (the `lan` audience, behind the passkey) and on the owner's own devices.
  Home is the owner's own store, as private as the phone, and sending to it is to be the
  default (#2182); Drive, the Jobs mailbox and a routine's model are third parties
  (`docs/learner-data-authority.md`, "The owner's deployment").
- **A comes first, and B shows A as it is.** Legibility effort goes to what really drives
  the workflow, and every surface does what it appears to do.
- **A way in for every reader.** Something anyone can take in (a short demo video), the
  live screens for the curious, the source for the technical, each disclosed by
  interaction rather than all at once. The extensions comb is the model
  (`packages/ui/honeycomb/src/components/extensions-comb/extensions.data.ts`).
- **One screen, two readings.** Where the owner and a viewer can reach the same screen, it
  says which of them is looking: `components/provenance-strip.tsx` under the web header
  tells the owner what a wing publishes and keeps, and tells a viewer it is sample data.
- **A viewer tries, and nothing is kept.** The Pages build is the viewer's (`VIEWER_BUILD`,
  `apps/www/src/lib/data-mode`). There the page's `localStorage` and `sessionStorage` are
  in-memory copies (`apps/www/src/lib/demo/viewer-storage.ts`, imported first by
  `main.tsx`), which `apps/www/src/lib/demo` seeds with sample drafts: a mock demo, where
  every store, the activity packages' included, works as usual and a reload starts over.
  A person's records may not bypass them (no IndexedDB, Cache Storage or cookie holding
  them on the Pages build); a convenience, such as the sidebar's open/closed cookie, may.
- **Say what it is.** In copy anyone reads (pages, READMEs, store listings, release
  notes), describe each thing by what it is and does, plus its honest limits. Skip foils
  and put-downs ("not another X", "not just a Y"): an affirmative definition says it all.
  The voice is plain and first-person, with no pitch and no promise of support.
- **State in the person's terms.** What the app says about itself (sharing, sending,
  saving, what failed) says what is kept where, and since when, never the machinery behind
  it: no request, status code, address, state name or internal term such as "grant" or
  "sync" reaches the screen. A surface's words live in one pure table that tests for this,
  as the sharing words of each record kept on home do (`apps/www/src/lib/home-link/words.ts`).
- **Never lose the record.** Because A is real use, the data it leaves (study sessions,
  reflections, typing rounds, voice takes) is also the evidence of growth over time:
  struggling to read a sentence at the first beta, finishing sessions much later. That
  record exists only if the history survives, so treat the owner's history as
  append-only. Before adding anything that discards or rewrites it (a cap that evicts old
  entries, pruning, a migration that drops or reshapes data, a "let it go" that deletes for
  good), give it a durable copy first, or ask. This is the
  owner's direction, not yet a declared invariant: today's code still discards history (a
  session delete, the `reflection-voice` and `scene-voice` budgets, the "let it go" steps),
  so an append-only claim would
  be false on landing. Declaring it, with a tag at each discard site, waits on the owner's
  call about those sites, which `docs/discard-sites.md` lists with each ruling so far (#2265).

`/mission` (`apps/www/src/routes/mission.tsx`) says the same to the viewer.

## Pre-commit verification (Claude Code Remote)

`.husky/pre-commit` skips its `lint-staged` step when `CLAUDE_CODE_REMOTE=true` — for a
commit spanning many workspaces, running per-package `eslint`, `tsc --noEmit`, and
`prettier` there routinely exceeds this sandbox's command timeout, which hangs the
commit rather than failing it cleanly. `commit-msg` (commitlint and the Change-Kind check) still
runs regardless.

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
> **RS2 (not reviewable): nothing else in this repository writes the route snapshot PR.**
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
  (30 days, one kept) and the Play review's inputs (3 days). Artifacts cannot be
  overwritten across runs, so a short `retention-days` is how a recreated one leaves no tail.
- **Enforced by `pnpm check:workflows`** (`scripts/check-workflows.ts`, rules in
  `packages/eslint/src/workflow-guards.ts`), also in root `pnpm lint`. The same script carries RS1's fingerprint and RS2's grep
  (above). It reads the value only as a direct child of the step's block-style `with:`
  map, where the action gets it; anywhere else it does not count, and a flow-style
  `with: {...}` or `- {uses: ...}` step fails as unreadable. It finds steps by their `uses:` line, so an upload
  wrapped in a composite action or another publisher's upload action is not seen: add
  it to the rule when one appears, as `docker/build-push-action`'s build record was
  (its step must set `DOCKER_BUILD_RECORD_UPLOAD: false`).

  Held by: `pnpm check:workflows`

- **Every artifact and cache belongs to a family** in `packages/eslint/src/retention.ts`:
  one state machine, each family an instance with its `keep` (validated generations kept
  per lineage, 0 for one consumed inside its run), its TTL, and for caches a scope
  (`per-ref`, `shared` for content-addressed entries such as the Nix store, `pool` for
  Docker's layer blobs). A generation is validated when its run succeeds; the machine
  keeps the newest `keep`, deletes only what is older than a validated one, and drops
  every cache on a ref that is no longer live. `.github/workflows/retention.yml` runs it
  after each workflow uploading a family kept across runs, and hourly, and deletes
  (a pull request that changes it only reports). `pnpm check:workflows` fails an upload name or
  cache key no family declares, an upload whose `retention-days` is not its family's
  TTL or whose workflow its family does not list, and a kept family's workflow
  `retention.yml` does not run after. A new family is a new entry there, not a new
  prune job.
- **Before shortening something to one day, name the path that breaks and its
  recovery** in the comment above the step. The usual one is "Re-run failed jobs" more
  than a day later, which finds no artifact: the recovery is a fresh run or the
  workflow's own `publish_only` dispatch, since re-running a day-old publish would ship a
  day-old build anyway.
- **What stays, and why** (not artifacts, so no `retention-days` applies):
  - Actions caches, swept by the families above. GitHub also evicts an entry unused
    for 7 days and, past the 10 GB cap, the least recently used.
  - The Pages deployment, npm packages, AMO submissions and the `paulgsc/www` Docker Hub
    image are the point of their workflows and are meant to last. Nothing prunes old
    Docker Hub tags; that is Docker Hub's storage, not this repo's.
  - Bot branches (`changeset-release/*`, `bot/server-route-snapshot`,
    `bot/flake-update`) are opened with `create-pull-request`'s `delete-branch: true`,
    so each deletes itself once `main` carries its content.
- **Repo setting, not code:** Settings → Actions → General → "Artifact and log
  retention" sets the default for any upload without `retention-days` and caps any
  explicit value above it. It also sets how long run logs are kept.

## Workflow security

No workflow or composite action expands text a stranger can write (a dispatch input, an
issue or PR title, body or branch name) into a `run:` script: pass it through `env:` and
validate it, as `extension-sign-manual.yml` does with its extension name. Write permissions
sit on the job that writes, not the workflow. `pnpm check:workflow-security`
(`scripts/check-workflow-security.sh`, promise WS1) runs actionlint, with ShellCheck, and
zizmor's offline audits at high severity over `.github/`, at the versions it pins. A finding
is fixed, or suppressed with its reason in `.github/zizmor.yml` or `.github/actionlint.yaml`
(an inline `# zizmor: ignore[...]` carries its reason in the comment above). It needs python3
and go, and installs the tools on first run.

Held by: `pnpm check:workflow-security`

## The phone and the desktop web are separate surfaces

The APK and the desktop web are orthogonal: each is built for what its device
affords, and neither is the other fitted onto a different screen. Nothing is
transposed from desktop to phone or stretched from phone to desktop by default;
an experience that only makes sense on one (Hangul Honeycomb, a physical-keyboard
game) belongs to that one alone, and the other build does not ship it. The
build audiences say this for whole workspaces: `apk` for the phone, `web` for
the desktop web, `public` for what both play
(`packages/some-vite-config/AUDIENCES.md`). Shared code reaches a `web`
workspace only through the web surface's door, `apps/www/src/lib/web-surface`
(invariant A4), and a build offers exactly the activities whose panel it binds
(`apps/www/src/lib/playable`). Before polishing, migrating or fixing UI, check
which surface renders it, and fix it for that surface's device. Phone and
desktop split in a few places: `useIsMobile` in `Leetype` (session files under 768px
wide, the typing game above), `chooseSurface` in topik (`HandheldLesson` under
768px wide or 480px tall, `DesktopSession` otherwise), the `lan` audience (not
in the APK build), and the `_apk` routes. The window-size splits follow the
window, not the device, so the APK on a tablet gets the wide surfaces too. When a repo-wide sweep has to skip a desktop-only file, say so
where the skip lives, as the `paletteRatchet` calls do.

**The phone is Android, and only Android** (owner, #1719). The APK and every
phone surface target Android's WebView and Chrome. Nothing in this repo targets
iOS, iPadOS or Safari, and whatever works there does so by coincidence. Add no
code, test, fallback or comment for them (a `webkit`-prefixed global Chrome does
not need, an Apple meta tag, a Safari-version workaround, an iPhone branch), and
delete one you find while working. A finding that reproduces only on iOS or
Safari is answered with this rule, not fixed or filed. A few tokens are held by
`pnpm check:android-only` (`scripts/check-android-only.ts`, rule in
`packages/eslint/src/android-only.ts`; also in root `pnpm lint`): `webkitAudioContext`, an Apple meta or link tag (`apple-touch-*`,
`apple-mobile-web-app-*`, `apple-itunes-*`), and an iOS device name (`iphone`, `ipad`,
`ipados`, `ipod`, in any case, and inside an identifier like `isIPhone`). It reads source and
markup files (code, HTML, CSS, JSON, XML, workflows; not Markdown or typst prose), comments
included, and every tracked path's name, where an iOS project's own files (an `ios/` folder,
`*.swift`, an Xcode project, `Podfile`, `Info.plist`) fail too. Beyond those, whether a line exists "for" Safari is a
reading of intent, since Chrome has
`webkit`-prefixed APIs of its own, so this stays a review rule (`REVIEW.md`, "The phone is
Android only"), not a declared invariant: a reviewer judges the hunk.

Held by: `pnpm check:android-only`

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

Held by: `pnpm check:test-layout`

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

Enforced as a count, not a verdict: `pnpm check:react-coordination` (also in root `pnpm lint`) fails when a React module, component or hook, has more or fewer
`await`/`.then`/`.catch`/`.finally` sites than `scripts/react-coordination.allowlist` says. An
entry is allowed when the reason is real: put it in its own group under
`# Coordination: <the external work, and why it cannot live outside React>`, never in the
grandfathered group. If the only honest reason is "it needs an await", the code belongs in the
runtime instead.

Held by: `pnpm check:react-coordination`

A port to anything we do not own (a native plugin, `navigator`, `Notification`) waits through
`callForeign` (`@some-ui/intent-kit`), never its own failure union or timeout; `unavailable` means
withdraw the control. `pnpm check:foreign-boundary` counts bare waits as R1 does (F1).

Held by: `pnpm check:foreign-boundary`

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
permanent gap, with `Tracked: #<issue>` in its block naming the issue that will make it a
check.

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

Something that no diff can falsify (CI wiring, say) is still listed, headed
`**<ID> (not reviewable): …**`, with where it is tracked, so a reviewer knows not to flag it.

**True when it lands.** Check every claim against the code in the same change that declares it.
If one doesn't hold, fix the code or narrow the claim. A declared invariant must describe the
code as it is, so any later violation is a regression, not old debt. Say how you checked it,
for example "all 12 exemptions conform".

**Placement.** Put the full set in the doc that owns the idiom. Put a one-line-per-ID summary in
the doc comment of the module it governs, so a reviewer reading the hunk finds it. IDs are
stable: never renumber; retire one by keeping its declaration, headed `**<ID> (retired): …**`,
with a `_Retired:_` line giving the reason. The first full set is
the resource-lifetime invariants L1–L8 in `extensions/common/GOOD_CITIZEN.md` → "Resource
lifetimes: what is enforced, and what is not"; `extensions/common/src/lib/lifetime/index.ts`
carries their one-line summaries.

A worked example, quoted from that set (`GOOD_CITIZEN.md` is the authoritative copy). It
began as "mechanical; not yet a rule"; once the existence half became a lint rule, the
invariant kept only what a person has to judge:

> **L3: An exemption names what ends the resource.**
>
> - _Claim:_ every `eslint-disable` of `require-named-lifetime` or `require-scoped-lifetime`
>   has a line starting `Lifetime:` in the unbroken `//` comment block directly above it,
>   saying what ends the resource.
> - _Falsified by_ a hunk that writes or rewords a `Lifetime:` line so it no longer names
>   what ends the resource, or that changes what ends an exempted resource without
>   updating that line; or a hunk that turns `require-lifetime-comment` off or narrows it.
> - _Scope:_ the whole repo.
> - _Why not enforced:_ that the line exists is a lint rule (`require-lifetime-comment`).
>   Whether it is true needs a person to read it.

**What a check holds.** `pnpm check:policy-docs` (`scripts/check-policy-docs.ts`, rules in
`packages/eslint/src/policy-docs.ts`; also in root `pnpm lint`) fails, in any markdown file, a declaration (a line
starting `**<ID>:`) with no `_Claim:_`, `_Falsified by_`, `_Scope:_` or `_Why not …:_` line,
an ID declared twice, and an ID declared at the base branch and not now; the debt label above in a
declaration's parts (its three spellings, across line breaks) with no `Tracked: #<issue>`, and more such
labels than the base branch has. In `CLAUDE.md`, `REVIEW.md` and
`AGENTS.md` it fails a path or quoted-heading reference that points at nothing; a line
`Held by: <check>` (the backticked `pnpm check:<name>`, alone on its line, under the rule it
holds) whose script is not in the root `package.json` or is run by no `run:` of a `pr.yml` job
CI Gate needs and may not skip (in a step with no `if:` or `continue-on-error:`), or a line starting `Held by` in another shape; and an `AGENTS.md` "Review guidelines" bullet that does not match a `REVIEW.md`
section by its bold lead, or names other `check:*` scripts or declared invariant IDs. A rule held by a
lint rule or a type names it in its own text and carries no `Held by:` line. A review does not
re-check those. Whether a falsifier is decidable from a hunk, whether a claim
is true, whether an old ID now carries a different claim and whether a sentence should be a
rule stay review's.

Held by: `pnpm check:policy-docs`

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

## Two kinds of pull request: the story moved, or a promise broke

Every PR is one of two kinds and says which. Both have the same autonomy: drive it green and
merge it. They differ in what green has to show.

- **Story.** The user story moved. Behaviour is added because the owner wants it, or retired
  because they no longer do: the background was green, and now the owner wants it purple. A
  preference is not right or wrong, so a story PR has nothing to prove beyond the repo's usual
  checks and its **Superseded** section. Raising a promise's reliability is a story too: the
  owner wants more than was promised.
- **Defect.** Code fails in a state its story already covered: a footgun, or a happy path that
  assumed some input, ordering, host or timing away. Every story ships with an implicit
  promise about the states it works in, and a defect is that promise surfacing. A failing
  state machine is a fact, so a defect PR carries the burden of proof.

**A promise** has an ID, three parts and an optional fourth. Its ID shares the invariants'
namespace: an area prefix and a number, never reused.

- **Claim:** one sentence about the code, over a named scope.
- **Family:** every state or environment the claim covers, named by the dimensions that
  generate it (orderings of events, hosts, inputs, timings), so a reviewer can check the
  proof against each dimension. For example: every interleaving of stop and resume; every
  host the story runs on.
- **Proof:** what holds the claim over the whole Family. That can be a test that enumerates or
  generates it, a type that makes the bad state unrepresentable, or a lint rule. Where no
  mechanism can hold it, the promise is a gray-area invariant (above) with all four of that
  format's parts.
- **Tolerance** (optional): the failure the claim accepts, such as best effort, a share of
  sittings, or hosts it leaves out. A failure inside the Tolerance is not a defect, and it
  leaves no record unless someone files it as a story to raise the promise.

A promise held by a test, type or lint rule lives with that check, its ID in the check's name
or comment. A gray-area promise is placed as invariants are (above).

**A defect PR:**

1. **Declares or amends a promise** whose Family contains the failing state. If the fix holds
   only part of the family, the claim and its Family are narrowed to that part.
2. **Relates it to the promises before it.** Search the earlier `Promise:` trailers (below)
   by path and by Family dimension. Each earlier promise that reaches the failing state gets
   one relation, and New means none does:
   - **New:** no earlier promise reaches the failing state by scope or by a shared dimension.
   - **Breaks:** the failing state was inside an earlier promise's Family. That proof was
     wrong, and the PR fixes the proof as well as the code.
   - **Widens:** the state was in an earlier promise's scope but outside its Family. That
     family was drawn too narrow, and the PR widens it.
   - **Shares:** the state is in another scope, but the failure turns on a dimension an
     earlier promise's Family already names (the same ordering, timing or host). The two
     are coupled, so the PR says why the earlier proof did not carry over.
3. **Says how the happy path got in:** which check could have caught it, and why none did.
   For Breaks, Widens and Shares, that means why the earlier PR missed this state.

**The record.** PRs merge by squash, which keeps the branch's commit messages
(`squash_merge_commit_message: COMMIT_MESSAGES`), so the record lives in commit trailers. They
go in each message's final paragraph, with no blank line before `Co-Authored-By:`:

```
Change-Kind: defect
Promise: SS2 apps/www/src/lib/session-stop | stop-resume ordering, host
Relates: SS1 shares stop-resume ordering
Co-Authored-By: …
```

Every commit but a merge, a revert or a fixup carries `Change-Kind: story` or
`Change-Kind: defect`, and `pnpm check:commit-trailers` (`packages/eslint/src/commit-trailers.ts`)
holds the shapes below: the commit-msg hook runs it on the message being written, and CI on
every commit a PR adds. Commits a bot writes are
exempt; a person's or an agent's commit on a bot's PR carries its own trailer. Keeping up with
a dependency (a renamed export, a changed default) is a story: no promise changed.

Held by: `pnpm check:commit-trailers`

The commit that declares or amends a promise adds `Promise: <ID> <path>… | <dimension>, …`:
its scope's paths, then its Family's dimensions, so a later search can match either. For a
defect other than New, it also adds one `Relates:` line per earlier promise:
`Relates: <ID> breaks`, `Relates: <ID> widens`, or `Relates: <ID> shares <dimension>`. A
story that raises a promise's Tolerance adds `Promise:` too, so the history shows the promise
changing. A change that is both a story and a defect is two PRs.

Query the trailers line by line, with `--grep`: a squash of several commits puts earlier
trailers mid-message, where `%(trailers)` does not find them. `git log -E --grep
'^Change-Kind: defect$'` lists every promise that broke, and each `Relates:` line names the
earlier promise it was coupled to. The share of defect commits over time is the churn signal.
Stories mean the product is moving. A run of defects that relate to one another means patches
are chasing a promise nobody has stated.

**Issues carry the kind too.** Whoever files an issue, a person, an agent or the reflection
routine, labels it `kind:story` or `kind:defect`. The existing `story` and `epic` labels say
how big the work is, and the `kind:` label says whether a promise broke. A defect issue names
the failing state and the promise it suspects, if one is declared. When choosing what to work
on next, `kind:defect` issues come first. Issues filed before this rule are labelled just in
time, by the PR or session that next touches one, against the code as it is then. Nobody
backfills them: most were written against a `main` that has since moved. Review enforces the
rest (`REVIEW.md`, "Change kind: a defect PR proves its claim").

## Operational assurance: the promises about outcomes and work

Two properties are owed across this repo and `paulgsc/server`: nothing fails without the
owner hearing of it, and nothing does work it does not need. `docs/operational-assurance.md` is
the grammar (obligations, outcomes, verdicts, evidence classes, the requirement kinds
OA1–OA9 and RE1–RE10). `packages/assurance/src/ledger.json` is the one record: each operation
family and its objectives, each `holds` with its proof or `broken`/`unproven` with its issue.
`/assurance` shows it to the owner and to anyone.

When a change touches what an objective describes, edit the ledger in the same PR: a verdict
that improves names its proof, a new route module is placed in a family or in
`synchronous`, and anything that weakens a promise (a `holds` that stops holding, a looser
bound, a changed requirement, a retirement) carries an amendment naming the owner's
decision. Ask the owner before writing one; never weaken a promise to get a PR green. A new server
route module fails the check on the route snapshot PR (`bot/server-route-snapshot`), which a
server workflow rewrites on every merge: place the module in its own PR here first (a placed
module the server does not serve yet is only a warning), then the snapshot goes green. A new
server table is the other way round: the server's `Assurance ledger` check fails every server PR
while `stores` names a table no migration has, so place the store here only once its server PR
is otherwise ready to merge, and merge that PR right after (#2306 turned every open server PR red).

Held by: `pnpm check:assurance`

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
  `apps/www/tests/ui-fit/harness.ts` (`VIEWPORTS`; the phone-only incident sweep takes
  `PHONE_VIEWPORTS` beside it), one of which (780×390) exists because the other
  three are all portrait or landscape-desktop, and a phone held sideways was therefore a
  shape nothing could fail on. If a report is about an orientation or window shape, check
  that matrix contains it before concluding the surface is fine.
- **A Capacitor plugin object is a thenable: never resolve a promise with one.** Its Proxy
  answers `then` too, so returning the plugin from an `async` function waits forever,
  silently. Box it (`return { plugin }`), and mock plugins as a Proxy that answers every key
  (`CapacitorSQLite` in `apps/www/src/lib/device-backend/capacitor-sqlite/index.test.ts`), or
  the test passes anyway.
- **A `console.error` in www is gone from release builds** (`build.minify.ts`), and the APK's
  console reaches nothing anyway. Report failures through `reportFailure` (`@some-ui/intent-kit`),
  which survives both: `adb logcat -s SomeUI`.
- **A session can migrate and deploy the Jobs mailbox, but only if it started after the
  Cloudflare variables did.** The environment carries `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`, so the session that merges a change to `apps/mailbox` applies its
  migrations and deploys it (`apps/mailbox/README.md`, "Deploy" and "Updating a deployed
  mailbox") instead of handing the owner the commands. A container's environment is fixed
  when it starts, though: a session started before a variable was added never sees it, and
  `wrangler whoami` then says only "You are not authenticated", with no error code. Check
  `[ -n "$CLOUDFLARE_API_TOKEN" ]` (never print it) before counting on it. If it is unset,
  give the owner a paste-ready prompt for a new session instead.
- **Nothing on a PR builds or launches the Android app.** `mobile-apk.yml` (Gradle
  compile, R8 release build, Android Lint, the Play review, and an emulator launch test)
  runs only on pushes to `main`, and builds only once someone approves that run (the
  `mobile-release` environment), so a Java error in `apps/mobile/android`, an R8 break or a
  Lint error (the review gates on errors, `lint.gate` in `apps/mobile/review/policy.json`;
  warnings stay report-only) first appears after merge and approval, on a green PR. Build it here before
  pushing any change under `apps/mobile/android`: dl.google.com is reachable, so unzip
  Google's `commandlinetools` into the scratchpad, `sdkmanager --sdk_root=<dir>
"platforms;android-36" "build-tools;36.0.0"`, then `pnpm exec cap sync android` from
  `apps/mobile` (it generates the gitignored `capacitor-cordova-android-plugins/`, without
  which Gradle fails to configure) and `ANDROID_HOME=<dir> ./gradlew :app:lintRelease
:app:assembleRelease`. Maven Central can answer 429 mid-download; that is rate limiting,
  so retry. Separately, vitest and every www Playwright suite run the `lan` or `pages`
  build profile, never `mobile`: `MOBILE_APP` and `hasAudience("apk")` are false there, so
  an APK-only branch (the wing bar, the header's way out, the foyer) is rendered by no test
  unless that test mocks `@/lib/build-profile` itself. `main`'s launch test does start the
  APK, each wing's launcher icon, and a monkey (`apps/mobile/launch/launch-test.sh`), but the
  monkey runs with `--pct-syskeys 0`: back is pressed exactly once, at a wing entered by its
  icon, so the rest of `MainActivity`'s back handling (the app has no `@capacitor/app`) is
  reached by no test.
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

Some stories in this repo span many sessions. A new session has no memory of earlier ones, so
the record that carries a story between them lives where any session can search it, never in a
handoff document (owner, 2026-10-25). It lives in two places, for two readers:

- **The epic issue holds the detail, for the next session.** Each story has an epic issue titled
  `[EPIC][<TAG>] …`, labelled `epic`, whose sub-issues are its stories (`[<TAG>] <ID>: …`), each
  closed by the PR that lands it. The epic opens with a `**Search words:**` line (the plain
  words someone might use to ask for it, the paths it touches, the tag) and a "Where we are"
  section (what landed, what is next, what waits on the owner). An issue says everything a cold
  session needs: why, what is decided and by whom, the files, what done means. What a handoff
  used to carry goes there too: the gaps a PR disclosed and left, and what a session working on
  the story should know (a fixture's quirk, a check that misleads). Keep them current while you
  work, not only at the end. The epic closes once its stories have landed and nothing in "Where
  we are" still waits on the owner.
- **The Residual Ledger is the owner's index, for the owner.** It is a private artifact,
  https://claude.ai/artifact/Ktc1i8JtBGQVdXEraobxgA, and its database's `items` collection
  holds one item per epic (`kind: "epic"`). Each item has:

  - a `summary` of a few sentences the owner reads to get back into it;
  - a `status`: `decide` while something waits on the owner, with `flag: "Waits on you"`;
    otherwise `open`, `doing` or `done`, and no `flag`;
  - a `first_step`: the next step, the owner's first when there is one;
  - `issues` linking the epic and its stories, and `keywords` matching the search words.

  Read and write it with `ArtifactData`; add notes to its `log` collection rather than
  rewriting history. The detail never goes in the ledger.

- **Starting from a vague ask** ("the jobs thing", "where were we on voice notes"): list the
  ledger's items and match their `keywords`, then search issues by the same words, then read
  the epic's "Where we are" and re-check it against the live code and PRs before trusting it.
  An open epic with no ledger item (one filed before 2026-10-25, say) gets one from the first
  session that touches it, and the epic gets a `**Search words:**` line and a "Where we are"
  if it lacks them.
- **Winding down,** whether the work is done or too large for one session: open and merge the
  PR for what you did (`.claude/skills/steward/SKILL.md`), then amend every issue you touched
  and its epic's "Where we are", then the ledger item (`summary`, `status`, `flag`,
  `first_step`, `issues`, `keywords`), then archive the session. Nothing about the story may
  live only in the session that is ending.

Cloud sessions keep no files between them, so the issues and the ledger are the only memory.
A footgun that recurs across sessions belongs promoted into this file (the section above) rather
than left in one epic.

See `.claude/skills/steward/SKILL.md` for how to drive an already-open PR (auto-merge
mechanics, bot-review handling, review coverage on every head) and
`.claude/skills/babysit/SKILL.md` for the separate polling-cadence policy — both are
consulted automatically when acting on CI or review events, not just on request.
