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

- **Fresh clone isn't build-ready.** `pnpm install` alone leaves no prebuilt `dist/` for
  intra-repo package deps. `npx turbo run build --filter="www^..." --continue` builds
  exactly the dependency graph a package needs — pass `--continue`, or one unrelated
  package's build failure aborts the whole graph before packages you actually need get
  built, and a subsequent `tsc --noEmit` then reports a wall of `Cannot find module
'@some-ui/...'` errors that look like real type errors but just mean "never built."
- **Scope `tsc`/`vitest` to the package**, don't run them from the repo root: `pnpm
--filter <pkg> exec tsc --noEmit`, `pnpm exec vitest run <path>` (not bare `npx vitest`).
- **A tool call can be denied by this environment's permission classifier independent of
  whether the action itself is valid** — scheduling calls (`send_later`/`create_trigger`)
  and cleanup calls (`unsubscribe_pr_activity`/`delete_trigger`) have each been denied in
  some sessions and succeeded immediately in others; no call is reliably always-blocked or
  always-unblocked. Treat each denial as independent: retry at most once or twice, and if a
  closely related tool does functionally the same thing, try that once before concluding the
  capability is unavailable this session. If a blocked call actually matters (state that
  should have been cleaned up wasn't, or there's no way left to get a future check-in
  scheduled), say so rather than silently working around it or silently doing without.
- **Before your first commit on a designated branch, check whether that branch's most
  recent PR already merged** (`git log`, or check the PR's state) — if so, restart the
  branch from a freshly fetched default branch (`git fetch origin main && git checkout -B
<branch> origin/main`) before adding new commits; never stack new work on top of
  already-merged history. Always `git fetch origin main` fresh before trusting a local
  `origin/main` ref for this check — a stale ref produces false alarms in both directions.
- **Run `git diff --stat` before every commit, not only `git status`** — a `Bin ... -> ...
bytes` line on a file you expect to be text source is the tell for embedded-NUL or other
  binary corruption that no lint, typecheck, or test will catch.
- **Verify a generated/derived value against the running code before asserting it**, don't
  hand-derive the expected value and trust it uninspected — anything with non-obvious
  ordering or filtering rules (a formatted string, a serialized summary) is easy to
  hand-predict wrong and only catch in front of a reviewer.

## Multi-session relay work

Some stories in this repo span many sessions, each picking up from a **self-contained
handoff document** written by the previous one — a new session has no memory of prior
conversation and must be able to work from the handoff alone. If you're continuing one:
re-read the live issue/PR the handoff describes before trusting its summary — it may
have been edited, or the state may have moved on, since the handoff was written. Don't
assume the footguns above are exhaustive either — a handoff documenting a _new_ one is
worth folding back into this file rather than left to be rediscovered by whichever future
session happens to receive that specific handoff.

If you're leaving unfinished multi-session work at the end of a session: write the next
handoff from `.claude/skills/steward/handoff-template.md`, and deliver it to the user
directly (e.g. via `SendUserFile`) rather than committing it to the repository. A handoff is
a stopgap for what hasn't earned a place in this file yet, not a replacement for it — a
footgun that shows up in more than one handoff belongs here instead, where every session
sees it regardless of which handoff (if any) it was actually handed.

See `.claude/skills/steward/SKILL.md` for how to drive an already-open PR (auto-merge
mechanics, bot-review handling, the re-review-request idiom) and
`.claude/skills/babysit/SKILL.md` for the separate polling-cadence policy — both are
consulted automatically when acting on CI or review events, not just on request.
