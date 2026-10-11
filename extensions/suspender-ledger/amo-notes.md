# AMO Notes to Reviewers — Suspender Ledger

The facts here hold for every version. What changed in a particular version is
in that version's "Notes for reviewers" on AMO, written from
`release/notes.md`; its generated tail compares the manifest and every built
file with the previous version.

## What it does

Suspender Ledger suspends background tabs to reclaim memory. Suspending is the
browser's own `tabs.discard()`: the tab keeps its place, URL, title, favicon and
history, and activating it reloads the page as an ordinary navigation. The
extension never closes a tab and never navigates one to an extension page.
(Versions before 0.2.1 shipped an unused `suspend.html`; it was removed.)

## Why `*://*/*`

The user can suspend any tab, and every tab has to be checked before it is
suspended, so the host list cannot be narrowed to a set of sites.

- `watch.js` (content script, `document_idle`) tracks two things in the page:
  whether a typed-into field still holds unsaved text, and when the page was
  last visible. Nothing else is read. It tells the worker when the page is
  shown or hidden.
- `resume-veil.js` (content script, `document_start`) covers a page that is
  reloading after a discard with a dark layer until it has loaded, so a light
  page does not flash. It reads and removes a one-time `sessionStorage` flag
  the extension set just before the discard.
- Before discarding, the worker runs a small function in the page with
  `scripting.executeScript` (`collectMeta` in `src/content/meta.ts`) that
  returns those two flags plus whether media is playing. If the user keeps the
  title marker on (the default), it also prefixes the page's own
  `document.title` with "💤 " and removes the prefix when the tab is activated
  again (`src/worker/core/title-marker.ts`).

Both content scripts also print one `console.log` line with the page's URL and
title when they load. It is a temporary diagnostic for an open reliability bug;
it goes only to that page's own console and is never stored or sent.

## Messages from other extensions

The worker answers one message from other installed extensions,
`{ method: "discard", query, forced }`, inherited from auto-tab-discard's API: it
discards the tabs that match the `tabs.query` filter it is given and replies with
their ids. It returns no other tab data, opens and closes nothing, and no other
external message is handled.

## Data

No page content, tab data or user activity is transmitted off-device; there is
no network code. `data_collection_permissions` is `["none"]`.

- **Settings:** `storage.local`.
- **Session state:** `storage.session` holds the session-only allow list and
  which tabs the browser declined to discard (shown as the toolbar badge count
  and a popup banner). It is cleared when the browser closes.

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
- **Tab identity:** a numeric tab id and the origin only
  (`https://example.com`). Paths, query strings, page titles and page content
  are never recorded.
- **How it leaves the machine:** only if the user clicks "Export JSON" on
  `debug.html` (reached from the popup's "Diagnostics" link), which saves a
  file they choose what to do with.

`data_collection_permissions` is declared as `["none"]`, which remains accurate:
nothing is collected in the sense the policy means. Full design notes are in
`docs/observability.md`.

## Building it

`README.build.md` in this directory. The source archive is `git archive` of
the release commit; `release/release.json` lists the SHA-256 of every file the
build produces.
