# @some-extension/suspender-ledger

## 0.2.2

### Patch Changes

- - test(extensions): move crowded colocated tests into **tests**/ (#1530)
  - fix(build): per-extension tsbuildinfo; typecheck and lint:js build their dependencies first (#1525)
  - fix(build): BLD-C config drift: clean:build, the www style scan, and the root manifest (#1523)
  - chore(deps-dev): bump eslint from 10.9.1 to 10.10.0 in the eslint group (#1403)
  - chore(deps): bump vite from 8.2.2 to 8.3.0 in the vite group (#1404)
  - chore(deps-dev): bump the eslint group across 1 directory with 5 updates (#1320)

## 0.2.1

- Removed an unused, dead code path (`suspend.html` and `src/suspend/*`) that
  was still bundled and exposed via `web_accessible_resources` to all sites,
  even though it was never reached by the live suspend flow — tab suspension
  uses the native `chrome.tabs.discard()` API only.
- Added an explicit Content-Security-Policy (`script-src 'self'; object-src
'self'`) to all extension pages.
- No changes to user-facing behavior — discard/resume, the popup, and
  keyboard shortcuts are unchanged from 0.1.0.
