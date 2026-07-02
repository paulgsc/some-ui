// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Pure typestate FSM for a single tab's suspend lifecycle.
 *
 * `discard.ts` performs two *separate* browser side effects to suspend a tab:
 *
 *   1. mark   — `executeScript(markBeforeDiscard)` prefixes the live
 *               `document.title` with the sleep marker and sets the resume flag.
 *   2. discard — `chrome.tabs.discard(tabId)` tears down the renderer.
 *
 * These are not atomic, and step 2 can be refused by the browser (an audible
 * YouTube tab, a tab Chrome has decided is not discardable, …). This machine
 * exists to make every ordering of those outcomes an explicitly-mapped state
 * rather than an implicit gap — so the contract below can be asserted
 * exhaustively (see `suspend-fsm.exhaustion.test.ts`) and against random event
 * sequences (see `suspend-fsm.property.test.ts`).
 *
 * ── The contract ──────────────────────────────────────────────────────────
 *
 * INVARIANT (the marker/discard coherence property):
 *
 *   A tab may only carry the sleep marker on its live title while it is either
 *   already discarded (the renderer is gone, so the marker is the browser's
 *   *cached* title and cannot mislead) or actively recovering (a marker-clear
 *   is in flight). No **settled, live** state may carry the marker.
 *
 *   Equivalently: `¬(isLive(s) ∧ isMarked(s) ∧ isSettled(s))`.
 *
 * The illegal state this forbids is `ORPHANED`: a live tab still playing its
 * audio, wearing "💤", that the browser refused to discard and that nothing
 * ever cleans up. That is precisely https://github.com/paulgsc/some-ui/issues
 * bugs behind #344 / #345 — a marked, audible, non-discarded tab.
 */

// ── States ──────────────────────────────────────────────────────────────────
//
// Discriminated on `kind` (repo FSM idiom). No payload is needed: the marker /
// liveness / settledness of a tab is fully determined by which state it is in.

export type SuspendState =
  // Live, unmarked, at rest — an ordinary eligible tab.
  | { readonly kind: "ACTIVE" }

  // Live, unmarked, at rest — suspend was refused up front because the tab is
  // playing media. The tab is deliberately left untouched (no marker applied).
  | { readonly kind: "BLOCKED" }

  // Live, unmarked, transient — suspend requested; the mark `executeScript` has
  // been dispatched but has not landed yet.
  | { readonly kind: "PREPARING" }

  // Live, marked, transient — the marker landed; `chrome.tabs.discard` is in
  // flight, its callback not yet returned.
  | { readonly kind: "SUSPENDING" }

  // Live, unmarked, transient — the marker was *skipped* (e.g. a chrome:// page
  // that cannot be scripted); discard still proceeds, just without a marker.
  | { readonly kind: "SUSPENDING_BARE" }

  // Not live, marked, at rest — the good terminal state. The renderer is gone,
  // so "💤" is the browser's cached tab-strip title, exactly as intended.
  | { readonly kind: "DISCARDED" }

  // Not live, unmarked, at rest — good terminal for a bare (unscriptable) tab.
  | { readonly kind: "DISCARDED_BARE" }

  // Live, marked, transient — discard was refused (or the user refocused mid
  // suspend) while a marker is on the page; the marker-clear `executeScript` is
  // in flight. Carries a recovery obligation, so it is *not* settled.
  | { readonly kind: "ROLLING_BACK" }

  // Live, marked, transient — a discarded tab is being reactivated; the reload
  // that reactivation triggers will reset the page's own title and drop the
  // marker. Recovery obligation pending → not settled.
  | { readonly kind: "RESUMING" }

  // Live, marked, at rest — THE ILLEGAL STATE. A tab the browser refused to
  // discard, still playing, still wearing the marker, with nothing scheduled to
  // fix it. Reachable in the current implementation; the invariant forbids it.
  | { readonly kind: "ORPHANED" }

export type SuspendStateKind = SuspendState["kind"]

// ── Events ────────────────────────────────────────────────────────────────

export type SuspendEvent =
  | { readonly type: "SUSPEND_REQUESTED" } // user/menu/idle asked to suspend
  | { readonly type: "MEDIA_PLAYING" } // audible/active-media detected
  | { readonly type: "MARK_APPLIED" } // executeScript(mark) resolved OK
  | { readonly type: "MARK_SKIPPED" } // executeScript(mark) failed (chrome://)
  | { readonly type: "DISCARD_SUCCEEDED" } // chrome.tabs.discard OK
  | { readonly type: "DISCARD_FAILED" } // chrome.tabs.discard lastError
  | { readonly type: "MARKER_CLEARED" } // rollback executeScript landed
  | { readonly type: "TAB_ACTIVATED" } // user focused the tab
  | { readonly type: "TAB_RELOADED" } // reactivated tab finished reloading

export type SuspendEventType = SuspendEvent["type"]

// ── Structural predicates (the invariant is defined in terms of these) ──────

const LIVE_KINDS: ReadonlySet<SuspendStateKind> = new Set([
  "ACTIVE",
  "BLOCKED",
  "PREPARING",
  "SUSPENDING",
  "SUSPENDING_BARE",
  "ROLLING_BACK",
  "RESUMING",
  "ORPHANED",
])

const MARKED_KINDS: ReadonlySet<SuspendStateKind> = new Set([
  "SUSPENDING",
  "DISCARDED",
  "ROLLING_BACK",
  "RESUMING",
  "ORPHANED",
])

// A state is "settled" when the machine is at rest: no internal follow-up
// event is expected to arrive on its own. Transient states carry an obligation
// (a callback, a reload, a rollback) and so are *not* settled.
const SETTLED_KINDS: ReadonlySet<SuspendStateKind> = new Set([
  "ACTIVE",
  "BLOCKED",
  "DISCARDED",
  "DISCARDED_BARE",
  "ORPHANED",
])

export const isLive = (s: SuspendState): boolean => LIVE_KINDS.has(s.kind)
export const isMarked = (s: SuspendState): boolean => MARKED_KINDS.has(s.kind)
export const isSettled = (s: SuspendState): boolean => SETTLED_KINDS.has(s.kind)

/**
 * The executable contract. `true` ⟺ the state does not leave a marker stranded
 * on a settled, live tab.
 */
export const invariant = (s: SuspendState): boolean =>
  !(isLive(s) && isMarked(s) && isSettled(s))

// ── Transition table ────────────────────────────────────────────────────────

const s = (kind: SuspendStateKind): SuspendState => ({ kind })

/**
 * Pure reducer. Unmapped (state, event) pairs are self-loops: an event that
 * does not apply to the current state leaves it unchanged.
 *
 * NOTE: this is the *current-behaviour* model. It is deliberately wrong in two
 * places so the property/exhaustion tests fail organically and pin the bugs:
 *
 *   - `MEDIA_PLAYING` is ignored (today the manual suspend path has no media
 *     guard — only `number.ts`'s auto path checks `audible`).
 *   - `SUSPENDING + DISCARD_FAILED` (and refocus mid-suspend) strands the
 *     marker in `ORPHANED` instead of rolling it back.
 */
export function reduce(state: SuspendState, event: SuspendEvent): SuspendState {
  switch (state.kind) {
    case "ACTIVE":
      switch (event.type) {
        case "SUSPEND_REQUESTED":
          return s("PREPARING")
        // BUG (#1): MEDIA_PLAYING is not handled — an audible tab proceeds to
        // suspend exactly like any other tab.
        default:
          return state
      }

    case "PREPARING":
      switch (event.type) {
        case "MARK_APPLIED":
          return s("SUSPENDING")
        case "MARK_SKIPPED":
          return s("SUSPENDING_BARE")
        default:
          return state
      }

    case "SUSPENDING":
      switch (event.type) {
        case "DISCARD_SUCCEEDED":
          return s("DISCARDED")
        // BUG (#2): discard refused → marker stranded on a live tab, forever.
        case "DISCARD_FAILED":
          return s("ORPHANED")
        // BUG (#2): user refocuses before discard confirms → marker stranded.
        case "TAB_ACTIVATED":
          return s("ORPHANED")
        default:
          return state
      }

    case "SUSPENDING_BARE":
      switch (event.type) {
        case "DISCARD_SUCCEEDED":
          return s("DISCARDED_BARE")
        case "DISCARD_FAILED":
        case "TAB_ACTIVATED":
          return s("ACTIVE")
        default:
          return state
      }

    case "DISCARDED":
      switch (event.type) {
        case "TAB_ACTIVATED":
          return s("RESUMING")
        default:
          return state
      }

    case "DISCARDED_BARE":
      switch (event.type) {
        case "TAB_ACTIVATED":
          return s("ACTIVE")
        default:
          return state
      }

    case "RESUMING":
      switch (event.type) {
        case "TAB_RELOADED":
          return s("ACTIVE")
        default:
          return state
      }

    case "ROLLING_BACK":
      switch (event.type) {
        case "MARKER_CLEARED":
          return s("ACTIVE")
        default:
          return state
      }

    case "BLOCKED":
    case "ORPHANED":
      return state
  }
}

// ── Enumerations for the exhaustion / property tests ────────────────────────
//
// `allStates` is the set of *legal* machine states (ORPHANED is intentionally
// excluded — it is the illegal state the contract forbids; the tests catch it
// as a *result* of `reduce`, they must not seed from it).

export const allStates: ReadonlyArray<SuspendState> = [
  { kind: "ACTIVE" },
  { kind: "BLOCKED" },
  { kind: "PREPARING" },
  { kind: "SUSPENDING" },
  { kind: "SUSPENDING_BARE" },
  { kind: "DISCARDED" },
  { kind: "DISCARDED_BARE" },
  { kind: "ROLLING_BACK" },
  { kind: "RESUMING" },
]

export const allEvents: ReadonlyArray<SuspendEvent> = [
  { type: "SUSPEND_REQUESTED" },
  { type: "MEDIA_PLAYING" },
  { type: "MARK_APPLIED" },
  { type: "MARK_SKIPPED" },
  { type: "DISCARD_SUCCEEDED" },
  { type: "DISCARD_FAILED" },
  { type: "MARKER_CLEARED" },
  { type: "TAB_ACTIVATED" },
  { type: "TAB_RELOADED" },
]

export const INITIAL_STATE: SuspendState = { kind: "ACTIVE" }
