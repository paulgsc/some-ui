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
