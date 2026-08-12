/**
 * SessionId — opaque monotonic lifecycle token, defined once in commons.
 *
 * Every extension that tears down and restarts a runtime against a vendor SPA
 * needs the same thing: a way to prove that a piece of state belongs to the
 * lifecycle that is running *now*, and not to the one that navigation replaced.
 * Async work started before a teardown will still resolve after it; without a
 * token the only options are a boolean flag (which the stale continuation reads
 * as `true` again after restart) or nothing at all.
 *
 * Compile-time invariant:
 *   The only way to obtain a SessionId is via {@link mkSession}.
 *   The only way to obtain a *new* SessionId is to call it again.
 *   Therefore any two values carrying different SessionIds are from different
 *   lifecycles — cross-session state cannot be constructed by accident, and a
 *   post-await `if (session !== this._session) return` is a total guard.
 *
 * The counter is module-scoped, and each extension bundles its own copy of the
 * commons, so workspaces never share a sequence (Charter mandate 1).
 *
 * Model lifted from some-censor/src/lib/content/session.ts.
 */

export type SessionId = number & { readonly __brand: "SessionId" }

let _counter = 0

/** Mint a fresh SessionId. Strictly increasing for the life of the bundle. */
export function mkSession(): SessionId {
  // Brand constructor: the assertion is required because brands are type-only.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return ++_counter as SessionId
}
