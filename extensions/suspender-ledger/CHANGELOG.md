# @some-extension/suspender-ledger

## 0.3.0

- Fixed: automatic suspension could stop working. The periodic check is no longer postponed every time the extension wakes up, a page that never answers the pre-suspend check is skipped after 5 seconds instead of stalling every tab behind it, and a suspension the browser reports but does not carry out is now detected and undone.
- New: when the browser declines to suspend a tab (for example because it is playing audio or holds unsaved input), the toolbar badge counts those tabs and the popup says why.
- New: a local Diagnostics page (popup → Diagnostics) shows the extension's health, counters and recent suspend decisions, with an "Export JSON" button for bug reports. Nothing is sent anywhere.

## 0.2.1

- Removed an unused, dead code path (`suspend.html` and `src/suspend/*`) that
  was still bundled and exposed via `web_accessible_resources` to all sites,
  even though it was never reached by the live suspend flow — tab suspension
  uses the native `chrome.tabs.discard()` API only.
- Added an explicit Content-Security-Policy (`script-src 'self'; object-src
'self'`) to all extension pages.
- No changes to user-facing behavior — discard/resume, the popup, and
  keyboard shortcuts are unchanged from 0.1.0.
