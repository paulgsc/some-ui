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
 */
export type {
  AuthorityPorts,
  AuthorityRuntime,
  AuthoritySnapshot,
} from "./runtime"
export type {
  Authority,
  AuthorityEvent,
  AuthorityKind,
  Backend,
  Choice,
  SessionBelief,
} from "./state"
export { createAuthority, StaleAuthorityError } from "./runtime"
export { authority, backendOf, browserPorts } from "./singleton"
export { authorityOf, defaultChoice, initialState, step } from "./state"
export { useAuthority, useAuthoritySnapshot } from "./use-authority"
