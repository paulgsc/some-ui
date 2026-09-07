# @some-extension/suspender-ledger

## 0.2.2

### Patch Changes

- - chore(deps-dev): bump the eslint group across 1 directory with 5 updates (#1320)

## 0.2.1

- Removed an unused, dead code path (`suspend.html` and `src/suspend/*`) that
  was still bundled and exposed via `web_accessible_resources` to all sites,
  even though it was never reached by the live suspend flow — tab suspension
  uses the native `chrome.tabs.discard()` API only.
- Added an explicit Content-Security-Policy (`script-src 'self'; object-src
'self'`) to all extension pages.
- No changes to user-facing behavior — discard/resume, the popup, and
  keyboard shortcuts are unchanged from 0.1.0.
