/**
 * The phone's link to the home server as one state: whether it is paired,
 * and the one thing it is doing, if any. `step` is pure; `./runtime` runs
 * the ports and feeds their results back as events.
 *
 * One operation at a time, by structure: pairing, unpairing, a sync, a
 * send and aph's keeping are arms of `activity`, and `step` refuses to
 * start one while another runs. A result for an operation that is no longer the current
 * one is dropped.
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
       * This pairing's own id, made when it was paired: what a choice to
       * keep sending is for (LA11), so a new pairing starts from nothing.
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
  /**
   * Keeping a record on home: what it has to send sent, started by
   * `lib/home-link/lanes` rather than a tap (LA9 to LA11).
   */
  | { readonly kind: "keeping"; readonly stopping: boolean }

export type HomeLinkState = {
  readonly link: Link
  readonly activity: Activity
  /** The last pairing attempt's failure and its host, until the next attempt. */
  readonly pairFailure: {
    readonly failure: PairFailure
    readonly base: string
  } | null
  /**
   * The id of the pairing the phone's own record held when this page load
   * read it, or null: a choice made before the consent log enters it only
   * under this pairing (LA9).
   */
  readonly opened: string | null
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
  /** The sync or send in flight ended, finished or stopped. */
  | { readonly type: "workEnded" }

export const INITIAL: HomeLinkState = {
  link: { kind: "reading" },
  activity: { kind: "idle" },
  pairFailure: null,
  opened: null,
}

const idle = { kind: "idle" } as const

/** A sync, a send or aph's keeping: the activities Stop ends. */
export function working(
  activity: Activity
): activity is Extract<Activity, { stopping: boolean }> {
  return (
    activity.kind === "syncing" ||
    activity.kind === "sending" ||
    activity.kind === "keeping"
  )
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
        opened: found !== null && typeof found !== "string" ? found.id : null,
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
    default: {
      return assertNever(event)
    }
  }
}
