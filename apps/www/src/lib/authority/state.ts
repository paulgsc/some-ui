/**
 * Where this tab's learner data lives, as a state union and one pure step.
 *
 * Pure: `runtime.ts` owns the handles and calls `step`; components read a
 * snapshot (`docs/monorepo-boundaries.md`, R1), since an account boundary is
 * where a late result could land over a newer one.
 *
 * Two questions, kept apart:
 * - **Which store holds this learner's sessions?** `Authority`: `local`,
 *   `account`, or `pending` (only while a returning account user's session is
 *   checked, so nothing flashes the wrong store).
 * - **Does this browser hold a server session?** `SessionBelief`. An expired
 *   session ends *account* capability without ending *local* learning.
 *
 * `choice` is the person's own, persisted. It starts `local` where a backend
 * is optional (the `lan` image) and becomes `account` only by signing in or
 * switching. Losing the session never rewrites it: the authority falls back
 * to `local` until a session is back, so an expiry wipes, uploads or merges
 * nothing.
 *
 * Reporting is a second, narrower consent: when the person studies, what is
 * open and which browser to wake are behaviour, not content (canon Remark
 * 7.6). They leave only with `reporting` on: off by default, per device, and
 * forgotten at every boundary (sign-in, sign-out, switch to the device). The
 * device build's in-process backend is exempt.
 *
 * `epoch` changes whenever the authority could mean a different store or
 * account. Work begun under epoch N drops its result if the runtime has moved
 * on (`isCurrent`).
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

/**
 * What this browser believes about its server session. `unreachable` (no
 * answer) says nothing about the session and must not be read as
 * `signed-out`, which would move a returning account user's work to the
 * device behind their back.
 */
export type SessionBelief =
  | "unknown"
  | "signed-in"
  | "signed-out"
  | "unreachable"

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
  /** The person's opt-in to reporting behaviour to the account. See above. */
  readonly reporting: boolean
  readonly epoch: number
}

export type AuthorityEvent =
  /** The person picked where their data lives. */
  | { readonly type: "chose"; readonly choice: Choice }
  /** The person turned reporting on or off. It changes no authority. */
  | { readonly type: "reporting-set"; readonly on: boolean }
  /** A probe answered. It learns about a session; it does not start one. */
  | {
      readonly type: "session-learned"
      readonly session: "signed-in" | "signed-out" | "unreachable"
    }
  /**
   * A ceremony (or a test) established a session, possibly for a different
   * account than this tab last acted for. `adopt` also makes the account the
   * data authority, which is what signing in means.
   */
  | { readonly type: "session-started"; readonly adopt: boolean }
  /**
   * The session ended. `forget` is the person leaving on purpose (sign-out,
   * account deletion): the choice goes back to the device. An expiry leaves
   * the choice alone.
   */
  | { readonly type: "session-ended"; readonly forget: boolean }

export type StepResult = {
  readonly state: AuthorityState
  /** The authority is a different one: caches built under the old one go. */
  readonly authorityChanged: boolean
}

export function initialState(
  backend: Backend,
  stored: Choice | null,
  reporting = false
): AuthorityState {
  return {
    backend,
    choice: effectiveChoice(backend, stored ?? defaultChoice(backend)),
    session: "unknown",
    reporting: backend === "remote" && reporting,
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
  // An unreachable server is not a lost session: the account stays the choice,
  // and its calls fail visibly rather than quietly landing on the device.
  if (state.session === "signed-in" || state.session === "unreachable") {
    return { kind: "account", epoch }
  }
  // Chose the account, still asking: undecided.
  if (state.session === "unknown") return { kind: "pending", epoch }
  // Chose the account, session gone: learn on the device until it is back.
  return { kind: "local", epoch }
}

/**
 * Whether behaviour (signals, presence, a push subscription) may be sent to the
 * account right now: the account is the authority and the person opted in. The
 * device build's backend is on the phone, so there it is always allowed.
 */
export function reportingAllowed(state: AuthorityState): boolean {
  return (
    authorityOf(state).kind === "account" &&
    (state.backend === "in-process" || state.reporting)
  )
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
    a.reporting === b.reporting &&
    a.epoch === b.epoch
  )
}

export function step(state: AuthorityState, event: AuthorityEvent): StepResult {
  const next = apply(state, event)
  // Leaving `pending` answers "which one?", not a change of authority:
  // nothing was read or sent while undecided, so nothing goes stale.
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
      const choice = effectiveChoice(state.backend, event.choice)
      // Moving to the device ends the account relationship's consents.
      return {
        ...state,
        choice,
        reporting: choice === "account" ? state.reporting : false,
      }
    }
    case "reporting-set": {
      return { ...state, reporting: state.backend === "remote" && event.on }
    }
    case "session-learned": {
      return { ...state, session: event.session }
    }
    case "session-started": {
      // Possibly another account's: whatever was agreed for the last one is not
      // agreed for this one.
      return {
        ...state,
        session: "signed-in",
        reporting: false,
        choice: event.adopt
          ? effectiveChoice(state.backend, "account")
          : state.choice,
      }
    }
    case "session-ended": {
      return {
        ...state,
        session: "signed-out",
        reporting: event.forget ? false : state.reporting,
        choice: event.forget ? "local" : state.choice,
      }
    }
    default: {
      return assertNever(event)
    }
  }
}
