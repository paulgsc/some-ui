import type { TabState } from "@filter/types/tab"

/**
 * Shared tab-state model for the content script and the background service
 * worker. Both used to define their own copy of the keybind cycle (content.ts
 * cycleState() and background.ts STATE_CYCLE) plus a hardcoded "auto" default in
 * several places; those drifted independently. This is the single source of
 * truth.
 *
 * Semantics under the always-apply model (#235):
 *   - "auto"   — themed by default (apply-then-detect dark theme). This is the
 *                neutral default for every tab.
 *   - "legacy" — explicit override to the global invert filter instead of the
 *                dark theme. Membership in the background's filteredTabIds list
 *                tracks exactly these explicit legacy overrides — NOT "filtering
 *                on/off", since auto is already themed.
 *   - "off"    — explicit opt-out (no theming at all).
 */

export const DEFAULT_TAB_STATE: TabState = "auto"

/** Keybind cycle order: auto → legacy → off → auto. */
export const STATE_CYCLE: Record<TabState, TabState> = {
  auto: "legacy",
  legacy: "off",
  off: "auto",
}

export function nextTabState(current: TabState): TabState {
  return STATE_CYCLE[current]
}
