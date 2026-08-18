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
