/**
 * Two rules for intent renderers.
 *
 * **Row-owned, not menu-owned.** The component that calls `useIntent` must
 * stay mounted for the intent's full lifetime. A dropdown item unmounts on
 * click and would orphan it, so lift `useIntent` to the row/card and have the
 * menu item call a prop (as `SessionCard` does).
 *
 * **Bulk: one intent, selection preserved.** `deleteMany`/`updateStatusMany`
 * are single batch requests, so one `useIntent` and the same `IntentButton`
 * cover them. Clearing the selection goes in `useIntentEffect(state,
 * onClearSelection)`, so a failure leaves the selection for a one-click retry.
 */

export { IntentButton } from "./intent-button"
export { IntentFailure } from "./intent-failure"
export { AmbientIntentStatus } from "./ambient-status"
