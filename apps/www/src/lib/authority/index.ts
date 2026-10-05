/**
 * Where this tab's learner data lives: the device or the account.
 *
 * `authority` is the one instance. The app reads it through `useAuthority`
 * (`use-authority.ts`) or, outside React, through `authority.getAuthority()`.
 * The decisions are in `state.ts`; the handles are in `runtime.ts`.
 *
 * Invariants this module carries (declared falsifiable in
 * `docs/learner-data-authority.md`):
 *
 *   LA1  `createFileHostTransport("account")` is the only way learner state
 *        reaches the operator's backend, and it answers `null` unless the
 *        authority is the account.
 *   LA2  Signing in or enrolling never writes local data to the account.
 *   LA3  A sessions-store result that outlives its authority is dropped
 *        (`StaleAuthorityError`), not shown.
 *   LA4  A corpus read carries no credentials (`PUBLIC_READ`).
 *   LA6  Behaviour (signals, presence, push) reaches the account only with the
 *        person's own opt-in, which every sign-in and sign-out forgets.
 */
export type { AuthoritySnapshot } from "./runtime"
export type { Authority, SessionBelief } from "./state"
export { StaleAuthorityError } from "./runtime"
export { authority } from "./singleton"
export { useAuthority, useAuthoritySnapshot } from "./use-authority"
