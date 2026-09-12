# Architecture — `@some-extension/mujik` (some-mujik)

**Artifact:** Firefox/Chrome browser extension — ambient music visualizer overlay.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

Renders a persistent, ambient now-playing overlay on the active tab, sourcing music state from a background YouTube or YouTube Music tab. Decouples the audio source from the visual surface: music plays in one tab, the overlay lives in another.

---

## Entry points

| Surface | Entry | Role |
|---|---|---|
| Content script | `src/content/` | Mounts the visualizer overlay into the active page |
| Background | `src/background/` | Polls the music tab; manages overlay state |
| Popup | `src/popup/` | On/off toggle and settings |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **Musical state** | Each song maps to inferred dimensions (valence, arousal, intensity, tempo) that drive the visual palette and animation parameters. |
| **Overlay** | A shadow-DOM-isolated overlay mounted at `Z_INDEX_POLICY` z-index, attached as a sibling to the page content (never inside it). |
| **Music source tab** | Background script detects an active YouTube/YT Music tab and reads its DOM via messaging to extract now-playing metadata. |
| **Draggable** | `src/content/lib/draggable.ts` — makes the overlay repositionable. Currently writes to `localStorage` (Charter §4 violation — migration to `browser.storage` is tracked in [#283](https://github.com/paulgsc/some-ui/issues/283)). |
| **Fullscreen watcher** | `src/content/lib/fullscreen.ts` — hides the overlay during fullscreen video. Planned replacement with commons `PageMonitor` (#283). |
| **Components** | `src/components/` — overlay UI components (React or Preact). |

---

## Module map

```
src/
  background/                 — music tab detection + metadata extraction
  content/
    lib/
      draggable.ts            — drag-to-reposition (⚠ writes raw localStorage)
      fullscreen.ts           — fullscreen hide/show (⚠ local watcher, pre-PageMonitor)
  components/                 — overlay React/Preact components
  popup/                      — popup UI
  styles/                     — overlay CSS
```

---

## Critical invariants

| # | Invariant |
|---|---|
| M1 | The overlay is shadow-DOM isolated and must never inherit styles from the host page. |
| M2 | The overlay's z-index must use the commons `Z_INDEX_POLICY` constant (2147483640), not `MAX_INT`. |
| M3 | Storage writes must use `browser.storage` (namespaced), never raw `localStorage` — once #283 lands. |
| M4 | The overlay must hide during fullscreen to not obstruct video. |

---

## Known gaps

- `draggable.ts` writes raw, unnamespaced `localStorage` — Charter §4 violation. Fix tracked in [#283](https://github.com/paulgsc/some-ui/issues/283).
- `fullscreen.ts` reinvents fullscreen detection; the commons `PageMonitor` should replace it (#283).

## ADRs

- [ADR 0001 — Overlay isolation via shadow DOM + Z_INDEX_POLICY](./docs/adr/0001-shadow-dom-overlay.md)

## See also

- Issues: [#283 coexistence adoption](https://github.com/paulgsc/some-ui/issues/283)
- [Good-Citizen Charter](../common/GOOD_CITIZEN.md) §5 (shadow DOM), §6 (z-index), §4 (namespaced storage)
