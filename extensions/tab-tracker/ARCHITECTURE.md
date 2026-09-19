# Architecture — TabLedger (`tab-tracker`)

**Artifact:** Firefox/Chrome browser extension — temporal tab accountability ledger.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

Passively tracks active time per tab (pausing when the browser loses focus, window switches, or tab switches) and surfaces it via a live HUD chip injected into every page and a popup ledger sorted by time spent.

---

## Entry points

| Surface | Entry | Role |
|---|---|---|
| Content script | injected into every page | HUD overlay with live clock + drift-correction flash |
| Background | background service | Tab activity event aggregation + ledger updates |
| Popup | popup | Sorted ledger: time bars, sparklines, session/all-time toggle, tags |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **Active-time model** | Only wall-clock time while the tab is the active, focused tab counts. Paused on blur, tab switch, or window switch. |
| **HUD overlay** | Monospace chip in top-right corner. Color-coded green → amber → red → violet as time accumulates. Fades during active use; surfaces on idle. |
| **Drift-correction flash** | On tab switch-to, briefly shows the session total before reverting to the live clock — corrects mental model mismatch. |
| **Threshold toasts** | Non-blocking bottom-left toasts at 15m, 45m, 90m per tab. |
| **Neglect alerts** | If the current tab has 45m+ and an "intentional" tab has <5m, a subtle nag appears. |
| **Popup ledger** | Tabs sorted by time. Tags: RABBIT HOLE, DEEP WORK, NEGLECTED, COLD. Sparkline history per tab. Markdown export. |

---

## Module map

```
src/                          — (structure mirrors standard extension layout)
  background/                 — event aggregation + ledger storage
  content/                    — HUD overlay + drift-correction flash
  popup/                      — popup ledger UI
README.md                     — full feature description + setup
AI.md                         — AI-assisted development notes
```

---

## Critical invariants

| # | Invariant |
|---|---|
| T1 | Active time only counts while the tab is the foreground tab in the focused window. |
| T2 | The HUD must not obstruct page content interaction — it uses `pointer-events: none` except on explicit interaction zones. |
| T3 | Time data survives browser restart (stored via `browser.storage.local`). |

## ADRs

- [ADR 0001 — Active-only time model (no idle or background time)](./docs/adr/0001-active-only-time-model.md)

## See also

- [README](./README.md)
- [AI notes](./AI.md)
