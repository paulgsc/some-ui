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

## Multi-session relay work

Some stories in this repo span many sessions, each picking up from a **self-contained
handoff document** written by the previous one — a new session has no memory of prior
conversation and must be able to work from the handoff alone. If you're continuing one:
re-read the live issue/PR the handoff describes before trusting its summary — it may
have been edited, or the state may have moved on, since the handoff was written.

If you're leaving unfinished multi-session work at the end of a session: write the next
handoff from `.claude/skills/steward/handoff-template.md`, and deliver it to the user
directly (e.g. via `SendUserFile`) rather than committing it to the repository.

See `.claude/skills/steward/SKILL.md` for how to drive a PR (auto-merge mechanics,
bot-review handling, the re-review-request idiom) and `.claude/skills/babysit/SKILL.md`
for the separate polling-cadence policy — both are consulted automatically when acting
on CI or review events, not just on request.

When a test or doc asserts a value computed by generated or derived output (a formatted
string, a serialized summary, anything with non-obvious ordering or filtering rules),
verify the prediction against the actual running code before writing it into the
assertion — don't hand-derive the expected value and trust it uninspected.
