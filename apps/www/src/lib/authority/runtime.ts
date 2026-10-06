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
  reportingAllowed,
  sameState,
  step,
} from "./state"

/** What the runtime needs from the outside world. */
export type AuthorityPorts = {
  /** The choice this browser remembered, or `null` for none or unreadable. */
  readChoice: () => Choice | null
  writeChoice: (choice: Choice) => void
  /** Whether this browser remembered the person's opt-in to reporting. */
  readReporting: () => boolean
  writeReporting: (on: boolean) => void
  /**
   * Calls `listener` when another tab of this browser changed what is
   * remembered. Returns the unsubscribe.
   */
  onRemoteChange: (listener: () => void) => () => void
}

/** A frozen, identity-stable view for React: a new object only when state changes. */
export type AuthoritySnapshot = {
  readonly authority: Authority
  readonly choice: Choice
  readonly session: SessionBelief
  readonly backend: Backend
  /** Chose the account, but there is no session to use it with right now. */
  readonly accountUnavailable: boolean
  /** The person's opt-in to reporting behaviour to the account. */
  readonly reporting: boolean
  /** Behaviour may be sent to the account right now (account authority and opted in). */
  readonly reportingAllowed: boolean
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
  /**
   * Resolves once the authority is decided (not `pending`), at once if it
   * already is. Routes wait on it so no page renders against the wrong store.
   * It starts nothing; the check, started elsewhere, has a deadline.
   */
  settled: () => Promise<void>
  chooseAccount: () => void
  chooseLocal: () => void
  /** Turn reporting on or off. Off is also what every sign-in and sign-out does. */
  setReporting: (on: boolean) => void
  /** Back to a fresh page load's state, keeping listeners. For tests only. */
  resetForTests: () => void
}

function snapshotOf(
  state: AuthorityState,
  previous?: AuthoritySnapshot
): AuthoritySnapshot {
  const authority = authorityOf(state)
  return Object.freeze({
    // The same object while the authority is the same, so a change of setting
    // does not look like a change of authority to anything holding it.
    authority:
      previous?.authority.kind === authority.kind &&
      previous.authority.epoch === authority.epoch
        ? previous.authority
        : Object.freeze(authority),
    choice: state.choice,
    session: state.session,
    backend: state.backend,
    accountUnavailable: accountUnavailable(state),
    reporting: state.reporting,
    reportingAllowed: reportingAllowed(state),
  })
}

export function createAuthority(
  backend: Backend,
  ports: AuthorityPorts
): AuthorityRuntime {
  let state = initialState(backend, ports.readChoice(), ports.readReporting())
  let snapshot = snapshotOf(state)
  const listeners = new Set<() => void>()
  const changeListeners = new Set<(authority: Authority) => void>()

  function dispatch(event: AuthorityEvent): void {
    const result = step(state, event)
    if (sameState(state, result.state)) return
    const choiceChanged = state.choice !== result.state.choice
    const reportingChanged = state.reporting !== result.state.reporting
    state = result.state
    snapshot = snapshotOf(state, snapshot)
    // Only a build where the person has a real choice remembers one.
    if (choiceChanged && state.backend === "remote")
      ports.writeChoice(state.choice)
    if (reportingChanged && state.backend === "remote")
      ports.writeReporting(state.reporting)
    // Authority listeners first: a cache must be emptied before any component
    // re-renders against the new snapshot and reads it.
    if (result.authorityChanged)
      for (const listener of changeListeners) listener(snapshot.authority)
    for (const listener of listeners) listener()
  }

  // Another tab's decision binds this one only toward less: a switch to the
  // device or a turned-off opt-in applies at once. Signing or opting in is
  // that tab's own act, with no session belief here to go with it.
  ports.onRemoteChange(() => {
    if (state.backend !== "remote") return
    if (state.choice === "account" && ports.readChoice() === "local") {
      dispatch({ type: "chose", choice: "local" })
    }
    if (state.reporting && !ports.readReporting()) {
      dispatch({ type: "reporting-set", on: false })
    }
  })

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
    settled: (): Promise<void> => {
      if (snapshot.authority.kind !== "pending") return Promise.resolve()
      return new Promise<void>((resolve) => {
        const off = (): void => {
          listeners.delete(check)
        }
        const check = (): void => {
          if (snapshot.authority.kind === "pending") return
          off()
          resolve()
        }
        listeners.add(check)
      })
    },
    chooseAccount: () => dispatch({ type: "chose", choice: "account" }),
    chooseLocal: () => dispatch({ type: "chose", choice: "local" }),
    setReporting: (on) => dispatch({ type: "reporting-set", on }),
    resetForTests: (): void => {
      state = initialState(backend, ports.readChoice(), ports.readReporting())
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
