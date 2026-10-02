/**
 * Where this tab's learner data lives, as a state union and one pure step.
 *
 * Pure: no storage, no network, no React. `runtime.ts` owns the handles and
 * calls `step`; components read a snapshot. That is the shape
 * `docs/monorepo-boundaries.md` ("Inside a React package: the component is
 * not the coordinator", R1) asks for wherever a late result could land over a
 * newer one, and an account boundary is exactly that.
 *
 * ## The two questions, kept apart
 *
 * - **Which store holds this learner's sessions?** `Authority`: the device
 *   (`local`), the account on the server (`account`), or not yet known
 *   (`pending`, only while a returning account user's session is being
 *   checked, so nothing flashes the wrong store).
 * - **Does this browser hold a server session?** `SessionBelief`. A person can
 *   be signed in and still be learning on this device, and an expired session
 *   must end *account* capability without ending *local* learning.
 *
 * ## What the choice means
 *
 * `choice` is the person's own, persisted. It starts as `local` wherever a
 * remote backend is optional (the `lan` image), because learning must not need
 * an account. It becomes `account` only by an explicit act: signing in or
 * switching. Losing the session never rewrites it: the authority falls back to
 * `local` for as long as the session is gone and returns to `account` when a
 * session is back, so nothing is wiped, uploaded or merged by an expiry.
 *
 * ## The epoch
 *
 * `epoch` changes whenever the authority could mean a different store or a
 * different account: its kind changed, or a ceremony started or ended a
 * session. A caller that began work under epoch N keeps its token and drops the
 * result if the runtime is no longer on N (`isCurrent`). No callback acts under
 * a new authority because a mutable global changed under it.
 */

/** What this build can reach. Fixed per build, decided from the build flags. */
export type Backend =
  /** No server at all (the GitHub Pages demo): always local. */
  | "none"
  /** A `file_host` that may or may not be used (the `lan` image): local first. */
  | "remote"
  /** The device build's in-process backend: it is the store, so it is the account. */
  | "in-process"

export type Choice = "local" | "account"

export type SessionBelief = "unknown" | "signed-in" | "signed-out"

export type AuthorityKind = "local" | "account" | "pending"

export type Authority = {
  readonly kind: AuthorityKind
  /** Which incarnation of that authority this is. Compare with `isCurrent`. */
  readonly epoch: number
}

export type AuthorityState = {
  readonly backend: Backend
  readonly choice: Choice
  readonly session: SessionBelief
  readonly epoch: number
}

export type AuthorityEvent =
  /** The person picked where their data lives. */
  | { readonly type: "chose"; readonly choice: Choice }
  /** A probe answered. It learns about a session; it does not start one. */
  | {
      readonly type: "session-learned"
      readonly session: "signed-in" | "signed-out"
    }
  /**
   * A ceremony (or a test) established a session, possibly for a different
   * account than this tab last acted for. `adopt` also makes the account the
   * data authority, which is what signing in means.
   */
  | { readonly type: "session-started"; readonly adopt: boolean }
  /**
   * The session ended. `forget` is the person leaving on purpose (signing out,
   * deleting the account): they are done with the account on this device, so
   * the choice goes back to the device. An expiry is not that, and leaves the
   * choice alone so the account is back the moment a session is.
   */
  | { readonly type: "session-ended"; readonly forget: boolean }

export type StepResult = {
  readonly state: AuthorityState
  /** The authority is a different one: caches built under the old one go. */
  readonly authorityChanged: boolean
}

export function initialState(
  backend: Backend,
  stored: Choice | null
): AuthorityState {
  return {
    backend,
    choice: effectiveChoice(backend, stored ?? defaultChoice(backend)),
    session: "unknown",
    epoch: 0,
  }
}

export function defaultChoice(backend: Backend): Choice {
  return backend === "in-process" ? "account" : "local"
}

/** A build with no server can only be local; the device build can only be account. */
function effectiveChoice(backend: Backend, choice: Choice): Choice {
  if (backend === "none") return "local"
  if (backend === "in-process") return "account"
  return choice
}

/** The authority these facts amount to. Pure; the epoch is carried, not derived. */
export function authorityOf(state: AuthorityState): Authority {
  const { epoch } = state
  if (state.choice === "local") return { kind: "local", epoch }
  if (state.session === "signed-in") return { kind: "account", epoch }
  // Chose the account, still asking: undecided.
  if (state.session === "unknown") return { kind: "pending", epoch }
  // Chose the account, session gone: learn on the device until it is back.
  return { kind: "local", epoch }
}

/** The person chose the account but there is no session to use it with. */
export function accountUnavailable(state: AuthorityState): boolean {
  return state.choice === "account" && state.session === "signed-out"
}

/** Field-for-field equality; `step` returns the same object when nothing changed. */
export function sameState(a: AuthorityState, b: AuthorityState): boolean {
  return (
    a.backend === b.backend &&
    a.choice === b.choice &&
    a.session === b.session &&
    a.epoch === b.epoch
  )
}

export function step(state: AuthorityState, event: AuthorityEvent): StepResult {
  const next = apply(state, event)
  // Leaving `pending` is the answer to "which one?", not a change of authority:
  // nothing could have been read or sent while it was undecided, so there is no
  // old authority to clear and no work to call stale.
  const before = authorityOf(state).kind
  const kindChanged = before !== "pending" && before !== authorityOf(next).kind
  const boundary =
    event.type === "session-started" ||
    (event.type === "session-ended" && state.session === "signed-in")
  const changed = kindChanged || boundary
  const result = changed ? { ...next, epoch: next.epoch + 1 } : next
  // Nothing changed: hand back what was given, so callers can compare by identity.
  return {
    state: sameState(state, result) ? state : result,
    authorityChanged: changed,
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled authority event: ${JSON.stringify(value)}`)
}

function apply(state: AuthorityState, event: AuthorityEvent): AuthorityState {
  switch (event.type) {
    case "chose": {
      return { ...state, choice: effectiveChoice(state.backend, event.choice) }
    }
    case "session-learned": {
      return { ...state, session: event.session }
    }
    case "session-started": {
      return {
        ...state,
        session: "signed-in",
        choice: event.adopt
          ? effectiveChoice(state.backend, "account")
          : state.choice,
      }
    }
    case "session-ended": {
      return {
        ...state,
        session: "signed-out",
        choice: event.forget ? "local" : state.choice,
      }
    }
    default: {
      return assertNever(event)
    }
  }
}
