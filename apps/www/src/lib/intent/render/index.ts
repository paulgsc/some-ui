/**
 * #945/S1's two decisions that had nothing to prototype against yet -
 * recorded here since nothing else in this directory is the right home for
 * them, and #936's S2/S3 both depend on having them settled going in.
 *
 * ## Placement: row-owned, not menu-owned
 *
 * The issue raises a real risk - `sessions/index.tsx:148,157`'s
 * `duplicateSession`/`deleteSession` triggered from a dropdown menu item
 * that unmounts on click, orphaning the intent mid-flight. It doesn't apply
 * to this codebase as it stands: `SessionCard` calls
 * `useDuplicateSession()`/`useDeleteSession()` directly and renders its own
 * icon buttons - there is no menu component in between. The row already
 * owns the intent, by construction. Recorded so the next person adding a
 * dropdown-menu action for a session knows the rule going in, rather than
 * discovering it by shipping the bug: **the component that calls
 * `useIntent` must be the component that stays mounted for the intent's
 * full lifetime**, which for anything menu-triggered means lifting the
 * `useIntent` call to the row/card and having the menu item call a prop,
 * not calling the mutation hook inside the menu item itself.
 *
 * ## Bulk shape: together, selection preserved, one intent
 *
 * `deleteMany`/`updateStatusMany` are already single batch requests at the
 * repository layer (`sessions-repository.ts`), not N per-row calls - so
 * "together" isn't a UI decision layered on top of a per-row API, it's
 * already the shape the data has. One `useIntent` over the whole batch,
 * rendered with the same `IntentButton` every single-action site uses - no
 * bulk-specific renderer needed.
 *
 * What *is* a UI decision: today's code only clears the selection in a
 * per-call `onSuccess` (`deleteMany.mutate(ids, { onSuccess:
 * onClearSelection })`), which - incidentally, not by design - already
 * means a failure leaves the selection untouched. `useIntent` deliberately
 * removes per-call `onSuccess` (see its own header), so the migration in
 * S3 moves `onClearSelection` into a `useIntentEffect(bulkIntent.state,
 * onClearSelection)` instead - decoupled from any one `.mutate()` call, and
 * preserving exactly the "selection survives failure, retry is one click"
 * property the issue asks for, verified by a test at the migration site
 * rather than asserted here.
 */

export { IntentButton } from "./intent-button"
export type { IntentButtonProps } from "./intent-button"
export { IntentFailure } from "./intent-failure"
export type { IntentFailureProps } from "./intent-failure"
export { AmbientIntentStatus } from "./ambient-status"
export type { AmbientIntentStatusProps } from "./ambient-status"
