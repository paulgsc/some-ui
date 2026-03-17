# tab-filter

Browser extension. Applies a CSS filter to arbitrary tabs for eye comfort. Per-tab targeting via popup UI or keyboard shortcut.

---

## Stack

- TypeScript, CSS — no framework
- Vite (build)
- Storybook (component stories)
- WebExtension API (`browser` / `chrome` shimmed at runtime)

---

## Structure

```
src/
  background/
    background.ts         # install init, shortcut handler
  content/
    content.ts            # filter application, message listener
  popup/
    types.ts              # FilterConfig, TabEntry, WindowGroup, PopupState
    popup.ts              # orchestration, state, render loop
    popup.html
    popup.css
    components/
      FilterBadge.ts      # header: filter status + count
      ActionBar.ts        # status pills + select controls + apply CTA
      WindowGroupHeader.ts
      TabList.ts          # grouped tab rows
      FilterBadge.stories.ts
      ActionBar.stories.ts
      TabList.stories.ts
```

---

## Build

```sh
npm install
npm run build       # outputs to dist/
npm run storybook   # component dev server
```

---

## Filter State Model

| Visual cue                     | Meaning                         |
| ------------------------------ | ------------------------------- |
| Teal left rail + teal checkbox | Filter currently applied to tab |
| Blue left rail + blue checkbox | Selected, pending apply         |
| Pulsing teal dot (header)      | At least one tab is filtered    |
| Grey dot (header)              | No tabs filtered                |

Selection and filter state are decoupled. Selecting a tab does not apply the filter — **Apply Filter (n)** commits the selection to storage and broadcasts to all tabs.

---

## Keyboard Shortcut

`Ctrl+Shift+F` / `Cmd+Shift+F` — toggles filter on the current active tab only. Updates `filteredTabIds` in local storage.

---

## Storage Schema

```ts
{
  filterEnabled: boolean        // legacy global flag
  filteredTabIds: number[]      // per-tab filter targets
  filterConfig: {
    invert: number              // default 1
    hueRotate: number           // default 180
    sepia: number               // default 0.12
    brightness: number          // default 0.5
    contrast: number            // default 0.92
  }
}
```

---

## Component Invariants

**Postcondition** (all components): return a detached `HTMLElement` with no side effects.

**Invariant** (`PopupState`): `selectedTabIds ⊆` tab ids present in `groups`.

**Invariant** (`PopupState`): `statusFilter ∈ { null, "active", "audible", "pinned" }`.

**Failure** (`applyFilterToTabs`): silently drops tabs where `sendMessage` rejects (tab navigated away or no content script).
