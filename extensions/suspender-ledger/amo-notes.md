# AMO Notes to Reviewers — Suspender Ledger

This extension operates as a tab suspender and must access every URL the user
visits (`*://*/*`) in order to monitor tab activity, detect unsaved form input,
and replace inactive tabs with a themed suspend page. Narrowing the host
permission to specific domains would break the core functionality of the
extension, which is to manage RAM usage across all browser tabs regardless of
their origin.

No page content, tab data, or user activity is transmitted off-device; all
processing is local. The content script (`watch.js`) only tracks whether the
page has unsaved form input and the time of the last visibility change — both
are used solely to decide whether a tab is safe to suspend.

## Local diagnostics (`debug.html`)

The extension keeps a local, bounded diagnostic log so users can self-diagnose
reliability problems and attach a report to a GitHub issue. This is offline
diagnostics, not telemetry — there is no network code anywhere in the
subsystem, and nothing is uploaded, ever.

- **Where it is stored:** a single `storage.local` key (`sl.observability.v1`).
- **How much:** a fixed-capacity ring buffer of 500 events, hard-capped at
  256 KB. It cannot grow beyond that regardless of how long the extension runs.
- **What it contains:** the extension's own decisions — alarm scheduling, sweep
  results, per-tab suspend outcomes and skip reasons — plus counters and its own
  invariant checks.
- **Tab identity:** origin only (`https://example.com`). Paths, query strings,
  page titles and page content are never recorded.
- **How it leaves the machine:** only if the user clicks "Export JSON" on
  `debug.html`, which produces a file they choose what to do with.

`data_collection_permissions` is declared as `["none"]`, which remains accurate:
nothing is collected in the sense the policy means. Full design notes are in
`docs/observability.md`.
