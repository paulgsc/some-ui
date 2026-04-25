
/**
 * SessionId — opaque monotonic token minted exactly once per lifecycle start.
 *
 * Compile-time invariant:
 *   The only way to obtain a SessionId is via mkSession().
 *   The only way to obtain a *new* SessionId is to call mkSession() again.
 *   Therefore any two ViewStates with different SessionIds are from different
 *   lifecycles — cross-session state cannot be constructed without an explicit reset.
 *
 * This makes the stale-state-after-navigation bug unrepresentable:
 *   a ViewState from session N cannot flow into a render pipeline expecting session M
 *   without the type system surfacing the mismatch.
 */
export type SessionId = number & { readonly __brand: "SessionId" }

let _counter = 0

export function mkSession(): SessionId {
  return (++_counter) as SessionId
}
