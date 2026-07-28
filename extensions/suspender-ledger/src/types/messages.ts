// Copyright (c) 2026 paulgsc — MIT License
//
// Content ↔ worker message protocol.
//
// This file is original work (not a port): upstream auto-tab-discard never
// messaged the worker from the page — its `watch.js` exposed `window`
// properties (`isReceivingFormInput`, `lastVisit`) that the worker read on
// demand via `executeScript`. That property contract is preserved (see
// `src/content/watch.ts`); these typed messages are an additive, push-based
// activity channel layered on top of it.

/**
 * Messages emitted by the content script (`watch.ts`) toward the service
 * worker. A tab announces when it becomes foregrounded (`TAB_ACTIVE`, carrying
 * the focus timestamp) or backgrounded (`TAB_IDLE`). The worker-side handler is
 * out of scope for the content-script story and lands separately; until then
 * these messages are emitted and harmlessly ignored.
 */
export type ContentToWorkerMessage =
  | { type: "TAB_ACTIVE"; timestamp: number }
  | { type: "TAB_IDLE" }

/** Narrowing guard for the content→worker activity protocol. */
export function isContentToWorkerMessage(
  value: unknown
): value is ContentToWorkerMessage {
  if (value === null || typeof value !== "object" || !("type" in value)) {
    return false
  }
  return value.type === "TAB_ACTIVE" || value.type === "TAB_IDLE"
}

/**
 * The discardable actions the popup can ask the worker to perform against the
 * active tab. These map 1:1 onto the menu-item ids the worker's `menu.ts`
 * dispatcher already understands (it resolves the active tab itself), so the
 * popup never needs the `tabs` permission to drive a suspend.
 *
 * `move-next` / `move-previous` are focus-navigation commands handled by the
 * worker's `navigate` module rather than the menu dispatcher; they are included
 * here because the popup surfaces them as quick-jump controls.
 */
export type PopupCommand =
  | "discard-tab"
  | "discard-tree"
  | "discard-tabs"
  | "discard-window"
  | "discard-other-windows"
  | "whitelist-domain"
  | "auto-discardable"
  | "move-next"
  | "move-previous"

/**
 * Messages the popup (and options surface, which the beta folds into the popup)
 * sends to the service worker.
 *
 * - `popup` dispatches a {@link PopupCommand} against the active tab. The
 *   optional `value` / `checked` / `shiftKey` fields mirror the menu
 *   `OnClickData` superset the worker already accepts, letting a single channel
 *   carry both plain actions (suspend) and toggles (auto-suspendable,
 *   whitelist on/off).
 * - `storage` reads the merged `local` + `session` snapshot back through the
 *   worker — the same round-trip upstream's popup used to hydrate its controls.
 */
export type PopupToWorkerMessage =
  | {
      method: "popup"
      cmd: PopupCommand
      value?: boolean
      checked?: boolean
      shiftKey?: boolean
    }
  | {
      method: "storage"
      local?: Record<string, unknown>
      session?: Record<string, unknown>
    }

/**
 * What the diagnostics page (`debug.html`) can ask the worker for.
 *
 * The page could read the recorder's persisted bundle out of `storage.local`
 * directly, but it asks the worker instead: the worker holds the *live*
 * in-memory ring buffer, which is by definition fresher than the last debounced
 * flush, and only the worker can evaluate invariants that need `tabs.query`.
 * Sending a message also wakes a recycled event page, so the page never reports
 * on a worker that is merely asleep.
 */
export type ObservabilityCommand = "export" | "clear"

export type DebugToWorkerMessage = {
  method: "observability"
  cmd: ObservabilityCommand
}

/** Narrowing guard for the debug-page protocol. */
export function isDebugToWorkerMessage(
  value: unknown
): value is DebugToWorkerMessage {
  if (value === null || typeof value !== "object" || !("method" in value)) {
    return false
  }
  if (value.method !== "observability") {
    return false
  }
  const cmd: unknown = Reflect.get(value, "cmd")
  return cmd === "export" || cmd === "clear"
}

/**
 * The worker's reply to a {@link PopupToWorkerMessage} `storage` read: the
 * merged `local` + `session` preference snapshot. Keys are untyped at the wire
 * boundary; callers narrow against the `Prefs` schema before use.
 */
export type WorkerToPopupMessage = Record<string, unknown>

/** Narrowing guard for the popup→worker protocol. */
export function isPopupToWorkerMessage(
  value: unknown
): value is PopupToWorkerMessage {
  if (value === null || typeof value !== "object" || !("method" in value)) {
    return false
  }
  return value.method === "popup" || value.method === "storage"
}
