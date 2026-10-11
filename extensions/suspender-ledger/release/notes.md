<!-- amo-release
version: 0.3.0
content: sha256:5e960b366f6a8986ab00868cc0178ba038b986d661aa35cb96f2c2ca4c17e36c
rationale: Minor. Adds two things users can see and use (the Diagnostics page, and the badge and popup banner for tabs the browser keeps awake) alongside fixes that make automatic suspension work again. Nothing is removed and no setting changes meaning.
-->

## Version notes

- Fixed: automatic suspension could stop working. The periodic check is no longer postponed every time the extension wakes up, a page that never answers the pre-suspend check is skipped after 5 seconds instead of stalling every tab behind it, and a suspension the browser reports but does not carry out is now detected and undone.
- New: when the browser declines to suspend a tab (for example because it is playing audio or holds unsaved input), the toolbar badge counts those tabs and the popup says why.
- New: a local Diagnostics page (popup → Diagnostics) shows the extension's health, counters and recent suspend decisions, with an "Export JSON" button for bug reports. Nothing is sent anywhere.

## Notes for reviewers

Suspender Ledger suspends background tabs with the browser's native tabs.discard(). There is no suspend page and it never closes a tab. Why it needs *://*/* and each permission, what both content scripts do, and how data is handled are in extensions/suspender-ledger/amo-notes.md in the source archive.

What changed since 0.2.1:

1. Reliability (src/worker/modes/number.ts, src/worker/core/discard.ts). The sweep alarm is installed once instead of being re-armed on every worker wake-up, which had postponed it indefinitely. Each pre-suspend page check (scripting.executeScript) has a 5-second deadline; a tab that misses it is skipped, not suspended. A discard the browser reports as done but did not perform is detected with tabs.get and rolled back.

2. Kept-awake feedback (src/worker/core/discard-state.ts, src/popup/). Tabs the browser declined to discard are counted on the toolbar badge and listed by reason in the popup. This state lives in storage.session only.

3. Local diagnostics (debug.html, src/debug/, src/worker/core/observability.ts). A bounded event log in storage.local (500 events, 256 KB) records the extension's own decisions, with tabs identified by origin only, and is shown on an extension page linked from the popup. It leaves the machine only through that page's "Export JSON" button, which downloads a file. No network code was added.

The permission, content script and file comparison below is computed from the 0.2.1 and 0.3.0 builds.
