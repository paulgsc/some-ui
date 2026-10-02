/**
 * The runtime around `step`: holds the current state, remembers the person's
 * choice, and tells listeners when the authority changed.
 *
 * It owns the only handles (storage and listeners). Everything that decides
 * is in `state.ts`.
 */
import type {
  Authority,
  AuthorityEvent,
  AuthorityKind,
  AuthorityState,
  Backend,
  Choice,
  SessionBelief,
} from "./state"
import {
  accountUnavailable,
  authorityOf,
  initialState,
  sameState,
  step,
} from "./state"

/** What the runtime needs from the outside world. */
export type AuthorityPorts = {
  /** The choice this browser remembered, or `null` for none or unreadable. */
  readChoice: () => Choice | null
  writeChoice: (choice: Choice) => void
}

/** A frozen, identity-stable view for React: a new object only when state changes. */
export type AuthoritySnapshot = {
  readonly authority: Authority
  readonly choice: Choice
  readonly session: SessionBelief
  readonly backend: Backend
  /** Chose the account, but there is no session to use it with right now. */
  readonly accountUnavailable: boolean
}

export type AuthorityRuntime = {
  getSnapshot: () => AuthoritySnapshot
  getAuthority: () => Authority
  subscribe: (listener: () => void) => () => void
  /**
   * Called when the authority is a different one (its kind changed, or a
   * session started or ended): whatever was fetched under the old one must go.
   */
  onAuthorityChange: (listener: (authority: Authority) => void) => () => void
  dispatch: (event: AuthorityEvent) => void
  /** Whether work that began under `token` is still working for this authority. */
  isCurrent: (token: Authority) => boolean
  /** Whether the current authority is `kind`. */
  is: (kind: AuthorityKind) => boolean
  chooseAccount: () => void
  chooseLocal: () => void
  /** Back to a fresh page load's state, keeping listeners. For tests only. */
  resetForTests: () => void
}

function snapshotOf(state: AuthorityState): AuthoritySnapshot {
  return Object.freeze({
    authority: Object.freeze(authorityOf(state)),
    choice: state.choice,
    session: state.session,
    backend: state.backend,
    accountUnavailable: accountUnavailable(state),
  })
}

export function createAuthority(
  backend: Backend,
  ports: AuthorityPorts
): AuthorityRuntime {
  let state = initialState(backend, ports.readChoice())
  let snapshot = snapshotOf(state)
  const listeners = new Set<() => void>()
  const changeListeners = new Set<(authority: Authority) => void>()

  function dispatch(event: AuthorityEvent): void {
    const result = step(state, event)
    if (sameState(state, result.state)) return
    const choiceChanged = state.choice !== result.state.choice
    state = result.state
    snapshot = snapshotOf(state)
    // Only a build where the person has a real choice remembers one.
    if (choiceChanged && state.backend === "remote")
      ports.writeChoice(state.choice)
    // Authority listeners first: a cache must be emptied before any component
    // re-renders against the new snapshot and reads it.
    if (result.authorityChanged)
      for (const listener of changeListeners) listener(snapshot.authority)
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => snapshot,
    getAuthority: () => snapshot.authority,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onAuthorityChange: (listener) => {
      changeListeners.add(listener)
      return () => {
        changeListeners.delete(listener)
      }
    },
    dispatch,
    isCurrent: (token) => token.epoch === state.epoch,
    is: (kind) => snapshot.authority.kind === kind,
    chooseAccount: () => dispatch({ type: "chose", choice: "account" }),
    chooseLocal: () => dispatch({ type: "chose", choice: "local" }),
    resetForTests: (): void => {
      state = initialState(backend, ports.readChoice())
      snapshot = snapshotOf(state)
      for (const listener of listeners) listener()
    },
  }
}

/**
 * Work that began under one authority was about to act under another. It is
 * dropped, not retried: the person's data lives somewhere else now.
 */
export class StaleAuthorityError extends Error {
  constructor(what: string) {
    super(`the data authority changed before ${what} could be used`)
    this.name = "StaleAuthorityError"
  }
}
