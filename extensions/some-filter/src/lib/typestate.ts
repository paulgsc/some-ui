/**
 * Typestate transition model for the filter content script.
 *
 * Invariant (I): at no time t is the vendor background exposed to the user
 * unless the tab is explicitly in "off" mode.
 *
 * States (S = ContentPhase × TabState):
 *
 *   prepaint   — document_start has fired; prepaint-start.js has raised the
 *                veil; the content script is not yet executing.
 *                Vendor BG: covered by veil.
 *
 *   init       — content script init() or applyState() is running.  Veil may
 *                still be up; theme application is underway.
 *                Vendor BG: covered by veil (or a theme that replaces it).
 *
 *   settled    — applyState() completed and visual state is committed.
 *                  auto    — dark theme applied (or vendor page already dark);
 *                            veil has been lifted.
 *                  legacy  — global invert filter in effect; veil lifted.
 *                  off     — no theme; veil lifted; vendor BG intentionally
 *                            visible (the one state where I is not required).
 *
 *   repainting — vendor DOM repaint or SPA navigation detected; veil has been
 *                re-raised; repatch underway.
 *                Vendor BG: covered by veil.
 *
 * Events (E):
 *
 *   script_start    — content script begins executing (init() is called).
 *   state_committed — applyState() / repatch cycle completed; visual state
 *                     is now committed.
 *   vendor_repaint  — vendor DOM repaint or SPA navigation that requires a
 *                     full re-patch (e.g. yt-navigate-finish; auto mode only
 *                     — legacy is immune because the root filter covers all
 *                     new nodes automatically).
 *   user_cycle      — user triggered a keybind or popup action to change
 *                     the current tab state.
 *   bg_reconcile    — background service worker responded with the
 *                     authoritative state; content script needs to re-apply.
 *
 * Transition table (phase dimension; mode changes are recorded separately):
 *
 *   prepaint   × script_start    → init
 *   init       × state_committed → settled
 *   settled    × vendor_repaint  → repainting
 *   settled    × user_cycle      → init
 *   settled    × bg_reconcile    → init
 *   repainting × state_committed → settled
 *
 * Any (phase × event) pair not listed above is a no-op (phase is unchanged).
 * This keeps the transition function total and safe to call for any event.
 */

import type { TabState } from "@filter/types/tab"

export type ContentPhase = "prepaint" | "init" | "settled" | "repainting"

export type ContentState = {
  readonly phase: ContentPhase
  readonly mode: TabState
}

export type ContentEvent =
  | "script_start"
  | "state_committed"
  | "vendor_repaint"
  | "user_cycle"
  | "bg_reconcile"

export const PHASE_TRANSITIONS: Readonly<
  Record<ContentPhase, Partial<Record<ContentEvent, ContentPhase>>>
> = {
  prepaint: {
    script_start: "init",
  },
  init: {
    state_committed: "settled",
  },
  settled: {
    vendor_repaint: "repainting",
    user_cycle: "init",
    bg_reconcile: "init",
  },
  repainting: {
    state_committed: "settled",
  },
} as const

/**
 * Compute the next phase given the current phase and an event.  Returns the
 * current phase unchanged if the event is not a declared transition for that
 * phase (safe no-op — unknown events are silently ignored).
 */
export function nextPhase(
  current: ContentPhase,
  event: ContentEvent
): ContentPhase {
  return PHASE_TRANSITIONS[current][event] ?? current
}

/**
 * Invariant check: returns true when the current state guarantees that the
 * vendor background is covered by either the prepaint veil or an active theme.
 *
 * The only state that intentionally exposes vendor BG is settled + off
 * (explicit user opt-out).  Every other (phase × mode) combination must have
 * vendor BG covered:
 *
 *   prepaint         — veil is up (prepaint-start.js).
 *   init             — veil is up or theme is being applied under it.
 *   settled + auto   — dark theme or native-dark page covers vendor.
 *   settled + legacy — invert filter applied to <html> covers everything.
 *   repainting       — veil has been re-raised before repatch begins.
 */
export function vendorBgCovered(state: ContentState): boolean {
  return !(state.phase === "settled" && state.mode === "off")
}
