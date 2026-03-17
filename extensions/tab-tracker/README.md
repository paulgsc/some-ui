# TabLedger

A temporal accountability ledger for your browser tabs. Track where your time actually goes — passively, permissionlessly, truthfully.

## What it does

- **Tracks active-only time** per tab (pauses when browser loses focus, switches windows, or you're on another tab)
- **HUD overlay** injected into every page: a monospace chip in the top-right corner showing a live running clock. Color-codes green → amber → red → violet as time accumulates. Fades when you're actively using the page, surfaces when you idle
- **Drift correction flash**: when you switch to a tab, the HUD briefly shows your session total for that tab before reverting to the live clock — reconciling your mental model with reality
- **Threshold toasts**: non-blocking bottom-left toast when you cross 15m, 45m, 90m on a tab (replaces tab theming, which the browser API won't allow)
- **Neglect alerts**: if you've been on a tab 45m+ and an intentional tab has <5m, the HUD shows a subtle nag
- **Popup ledger**: click the extension icon to see a sorted ledger of all tabs with time bars, session/all-time toggle, tags (RABBIT HOLE, DEEP WORK, NEGLECTED, COLD), sparkline history per tab, and markdown export

## Setup

```bash
npm install
npm run build
```

Then in Firefox:

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `dist/manifest.json`

For persistent install, package with `web-ext`:

```bash
npx web-ext build --source-dir dist
```

## Development

```bash
npm run dev   # watch mode, rebuilds on change
```

After each rebuild, click the reload button in `about:debugging` to pick up changes.

## Architecture

```
src/
  types.ts                  — shared types, formatters, constants
  background/background.ts  — the accountant: state machine, storage, badge updates
  content/content.ts        — the HUD: injected overlay, threshold toasts
  popup/popup.ts            — the ledger: sorted view, sparklines, export
  popup/popup.html
manifest.json
vite.config.ts
```

## Key design decisions

- `persistent: true` on background — required for a timer. Non-persistent workers get killed between tab switches and lose `lastActivated`, corrupting accumulated time
- Active-only tracking: time only accumulates on the single focused tab in the focused window
- `webextension-polyfill` for cross-browser `browser.*` API compatibility (Chrome uses `chrome.*`, Firefox uses `browser.*`)
- No permissions beyond `storage`, `tabs`, `activeTab`, `windows` — no history, no browsing data

## Tag legend

| Tag           | Meaning                        |
| ------------- | ------------------------------ |
| `live`        | Currently active tab           |
| `intent`      | You marked this as intentional |
| `rabbit hole` | >40% of session time           |
| `deep work`   | >45m focused session           |
| `neglected`   | <5m while session is long      |
| `cold`        | Zero time this session         |
