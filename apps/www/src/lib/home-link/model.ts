/**
 * The phone's link to the home server as one state: whether it is paired,
 * the one thing the person's side is doing (`activity`), and the drain's
 * one run (`drain`). `step` is pure; `./runtime` runs the ports and feeds
 * their results back as events.
 *
 * What runs at once, by structure:
 *
 * - **The person's side, one at a time:** pairing, unpairing, a sync, a
 *   tap's send and a screen's read (`keeping`) are arms of `activity`, and
 *   `step` refuses to start one while another runs.
 * - **The drain, one run at a time:** one lane's run (`./lanes`), so no two
 *   lanes' read-then-write of what this phone keeps (`./sent`) interleave.
 * - **A read or a sync beside a drain run:** each of its requests is answered
 *   on its own, and none changes what a lane is sending.
 * - **A send or an Unpair never beside one:** a tap's steps (Clear, Let it
 *   go, Delete) work on records a lane sends, and Unpair must not sign out
 *   under a run holding the old key. Either may be pressed while a drain
 *   runs: the runtime stops that run, which keeps what home took, and sends
 *   nothing until that run has ended (`writing`); no drain starts while one
 *   runs, and a tap's let-go on the phone of what home answered happens
 *   inside its run (`./delete-note`'s `settle`). Pairing happens only
 *   unpaired, when nothing drains.
 *
 * A result for an operation that is no longer the current one is dropped.
 */
import { assertNever } from "@some-ui/core-utils"

/** Why the phone is not paired, said once beside the block. */
export type UnpairedNote =
  /** Unpaired, and home was told. */
  | "unpaired"
  /** Unpaired on the phone; home could not be reached to be told. */
  | "unpaired-offline"
  /** The pairing's record could not be read back (a restore, say). */
  | "lost"
  /** The record is there, but the phone could not read it just now. */
  | "unreadable"

export type PairFailure =
  | "unreachable"
  | "untrusted"
  | "bad-code"
  | "too-many"
  | "not-set-up"
  | "not-home"
  | "not-kept"
  | "other"

type Link =
  /** The phone's own record is being read: no request to home. */
  | { readonly kind: "reading" }
  | { readonly kind: "unpaired"; readonly note: UnpairedNote | null }
  | {
      readonly kind: "paired"
      readonly base: string
      /**
       * This pairing's own id, made when it was paired: what this phone's
       * record of what home holds is for (`./sent`), so a new pairing
       * starts from nothing.
       */
      readonly id: string
      /** The last Unpair could not forget the key on the phone. */
      readonly notForgotten: boolean
    }

type Activity =
  | { readonly kind: "idle" }
  | { readonly kind: "pairing"; readonly base: string }
  | { readonly kind: "unpairing" }
  /** Reading published content from home, with no credential. */
  | { readonly kind: "syncing"; readonly stopping: boolean }
  /** Sending what this phone holds to the paired home, with its key. */
  | { readonly kind: "sending"; readonly stopping: boolean }
  /** A screen's read of home, with its key: Korean's look, My data, Ideas on home. */
  | { readonly kind: "keeping"; readonly stopping: boolean }

type Drain =
  | { readonly kind: "idle" }
  /** One lane's run (`lib/home-link/lanes`, LA15). */
  | { readonly kind: "draining"; readonly stopping: boolean }

export type HomeLinkState = {
  readonly link: Link
  readonly activity: Activity
  readonly drain: Drain
  /** The last pairing attempt's failure and its host, until the next attempt. */
  readonly pairFailure: {
    readonly failure: PairFailure
    readonly base: string
  } | null
  /** When home's busy ends (AD3, `./runtime`); null while it is not busy. */
  readonly homeBusyUntil: number | null
}

export type HomeLinkEvent =
  | {
      readonly type: "read"
      readonly found:
        | { readonly base: string; readonly id: string }
        | "lost"
        | "unreadable"
        | null
    }
  | { readonly type: "pairPressed"; readonly base: string }
  | { readonly type: "paired"; readonly base: string; readonly id: string }
  | { readonly type: "pairFailed"; readonly failure: PairFailure }
  | { readonly type: "unpairPressed" }
  | { readonly type: "unpaired"; readonly told: boolean }
  | { readonly type: "unpairFailed" }
  | { readonly type: "syncPressed" }
  | { readonly type: "sendPressed" }
  | { readonly type: "keepStarted" }
  | { readonly type: "stopPressed" }
  | { readonly type: "drainStarted" }
  /** Stop the drain's run: the background, or a send or an Unpair pressed. */
  | { readonly type: "drainStopped" }
  | { readonly type: "drainEnded" }
  /** The sync or send in flight ended, finished or stopped. */
  | { readonly type: "workEnded" }
  /** Home answered `429`, asking to be left alone until `until`. */
  | { readonly type: "homeBusy"; readonly until: number }
  /** The time home asked for has passed. */
  | { readonly type: "cooled" }

export const INITIAL: HomeLinkState = {
  link: { kind: "reading" },
  activity: { kind: "idle" },
  drain: { kind: "idle" },
  pairFailure: null,
  homeBusyUntil: null,
}

const idle = { kind: "idle" } as const

/** A sync, a send or a read: the activities Stop ends. */
export function working(
  activity: Activity
): activity is Extract<Activity, { stopping: boolean }> {
  return (
    activity.kind === "syncing" ||
    activity.kind === "sending" ||
    activity.kind === "keeping"
  )
}

/**
 * Whether home is still to be left alone at `now` (AD3): a wait whose time
 * has passed is over, even before the link hears its timer.
 */
export function homeBusy(state: HomeLinkState, now: number): boolean {
  return state.homeBusyUntil !== null && now < state.homeBusyUntil
}

/** The person's activities no drain run goes beside. */
export function writing(activity: Activity): boolean {
  return activity.kind === "sending" || activity.kind === "unpairing"
}

/** Whether the link would start a drain run. */
export function drainFree(state: HomeLinkState): boolean {
  return state.drain.kind === "idle" && !writing(state.activity)
}

/** Whether the link would start a drain run at `now`, home not busy. */
export function linkOpen(state: HomeLinkState, now: number): boolean {
  return drainFree(state) && !homeBusy(state, now)
}

export function step(
  state: HomeLinkState,
  event: HomeLinkEvent
): HomeLinkState {
  const { link, activity } = state
  switch (event.type) {
    case "read": {
      if (link.kind !== "reading") return state
      const { found } = event
      return {
        ...state,
        link:
          found === null
            ? { kind: "unpaired", note: null }
            : typeof found === "string"
              ? { kind: "unpaired", note: found }
              : {
                  kind: "paired",
                  base: found.base,
                  id: found.id,
                  notForgotten: false,
                },
      }
    }
    case "pairPressed": {
      if (link.kind !== "unpaired" || activity.kind !== "idle") return state
      return {
        ...state,
        activity: { kind: "pairing", base: event.base },
        pairFailure: null,
      }
    }
    case "paired": {
      if (activity.kind !== "pairing" || activity.base !== event.base)
        return state
      return {
        ...state,
        link: {
          kind: "paired",
          base: event.base,
          id: event.id,
          notForgotten: false,
        },
        activity: idle,
        pairFailure: null,
      }
    }
    case "pairFailed": {
      if (activity.kind !== "pairing") return state
      return {
        ...state,
        activity: idle,
        pairFailure: { failure: event.failure, base: activity.base },
      }
    }
    case "unpairPressed": {
      if (link.kind !== "paired" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "unpairing" } }
    }
    case "unpaired": {
      if (activity.kind !== "unpairing") return state
      return {
        ...state,
        link: {
          kind: "unpaired",
          note: event.told ? "unpaired" : "unpaired-offline",
        },
        activity: idle,
        pairFailure: null,
      }
    }
    case "unpairFailed": {
      if (activity.kind !== "unpairing" || link.kind !== "paired") return state
      return { ...state, link: { ...link, notForgotten: true }, activity: idle }
    }
    case "syncPressed": {
      if (link.kind === "reading" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "syncing", stopping: false } }
    }
    case "sendPressed": {
      if (link.kind !== "paired" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "sending", stopping: false } }
    }
    case "keepStarted": {
      if (link.kind !== "paired" || activity.kind !== "idle") return state
      return { ...state, activity: { kind: "keeping", stopping: false } }
    }
    case "stopPressed": {
      if (!working(activity)) return state
      return { ...state, activity: { kind: activity.kind, stopping: true } }
    }
    case "workEnded": {
      if (!working(activity)) return state
      return { ...state, activity: idle }
    }
    case "drainStarted": {
      if (link.kind !== "paired" || !drainFree(state)) return state
      return { ...state, drain: { kind: "draining", stopping: false } }
    }
    case "drainStopped": {
      if (state.drain.kind !== "draining") return state
      return { ...state, drain: { kind: "draining", stopping: true } }
    }
    case "drainEnded": {
      if (state.drain.kind !== "draining") return state
      return { ...state, drain: idle }
    }
    case "homeBusy": {
      const until = Math.max(state.homeBusyUntil ?? event.until, event.until)
      if (until === state.homeBusyUntil) return state
      return { ...state, homeBusyUntil: until }
    }
    case "cooled": {
      if (state.homeBusyUntil === null) return state
      return { ...state, homeBusyUntil: null }
    }
    default: {
      return assertNever(event)
    }
  }
}
